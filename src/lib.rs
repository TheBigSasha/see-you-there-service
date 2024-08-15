use serde::{Deserialize, Serialize};
use worker::*;

#[derive(Deserialize, Serialize)]
struct MetSeeItem {
    name: String,
    email: String,
    url: String,
    message: String,
    event_id: String,
    has_met: bool,
    code: String,
}

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: worker::Context) -> Result<Response> {
    let router = Router::new();

    router
        .get_async("/db_read_test", |_req, ctx| async move {
            let db = ctx.env.d1("DB")?;
            let query = "PRAGMA table_list";
            let result = db.prepare(query).all().await?;
            if(result.success()) {
                println!("Success");
                let res = result.results()?;
                if res.len() == 0 {
                    return Response::ok("No tables found");
                }else {
                    return Response::ok(String::from(res.get(0).unwrap().get(1).unwrap()));
                }
            }else {
                return Response::error(format!("Error: {}", result.error().unwrap()), 500);
            }
        })
        .get_async("/listallmessages", |_req, ctx| async move {
            let db = ctx.env.d1("DB")?;
            let query = "SELECT * FROM messages";
            let result = db.prepare(query).all().await?;
            if(result.success()) {
                println!("Success");
            }else {
                return Response::error(format!("Error: {}", result.error().unwrap()), 500);
            }
            println!("Extracting results");
            let messages: Vec<MetSeeItem> = result.results()?;
            println!("Found {:?} messages", messages.len());
            let items = messages
                .into_iter()
                .map(|msg| format!("{}: {}", msg.name, msg.message))
                .collect::<Vec<_>>()
                .join("\n");

            Response::ok(format!("Hello! Here are all the messages:\n{}", items))
        })
        .get_async("/", |_req, _ctx| async move {
            Response::ok("thebigsasha's 'met you there' / 'see you there' service API")
        })
        .post_async("/collect-email", |mut req, ctx| async move {
            let body = req.json::<MetSeeItem>().await?;

            // Store the message in D1
            let db = ctx.env.d1("DB")?;
            let create_msgs = "CREATE TABLE IF NOT EXISTS messages (name TEXT, email TEXT, url TEXT, message TEXT, eventID TEXT, hasMet BOOLEAN, code TEXT)";
            db.prepare(create_msgs).run().await?;
            let query = "INSERT INTO messages (name, email, url, message, eventID, hasMet, code) VALUES (?, ?, ?, ?, ?, ?, ?)";
            db.prepare(query)
                .bind(&[
                    body.name.into(),
                    body.email.into(),
                    body.url.into(),
                    body.message.into(),
                    body.event_id.into(),
                    body.has_met.into(),
                    body.code.into(),
                ])?
                .run()
                .await?;

            Response::ok(format!(
                "Hello! Successfully collected email for event"            ))
        })

        .post_async("/metyouthere", |mut req, ctx| async move {
            let body = req.json::<MetSeeItem>().await?;

            // Store the message in D1
            let db = ctx.env.d1("DB")?;
            let create_msgs = "CREATE TABLE IF NOT EXISTS messages (name TEXT, email TEXT, url TEXT, message TEXT, eventID TEXT, hasMet BOOLEAN, code TEXT)";
            db.prepare(create_msgs).run().await?;
            let query = "INSERT INTO messages (name, email, url, message, eventID, hasMet, code) VALUES (?, ?, ?, ?, ?, ?, ?)";
            let result = db.prepare(query)
                .bind(&[
                    body.name.into(),
                    body.email.into(),
                    body.url.into(),
                    body.message.into(),
                    body.event_id.into(),
                    body.has_met.into(),
                    body.code.into(),
                ])?
                .run()
                .await?;

            if result.success() {
                println!("Success");
            } else {
                return Response::error(format!("Error: {}", result.error().unwrap()), 500);
            }

            Response::ok(format!(
                "Hello! You have successfully posted a 'met you there' message this event",
            ))
        })
        // ... (other routes remain unchanged)
        .run(req, env)
        .await
}

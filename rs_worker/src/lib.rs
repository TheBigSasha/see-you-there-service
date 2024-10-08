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
                let res: Vec<MetSeeItem> = result.results()?;
                if res.len() == 0 {
                    return Response::ok("No tables found");
                }else {
                return Response::ok(format!("Hello! Found {:?} tables", res.len()));
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
            let create_msgs = "CREATE TABLE IF NOT EXISTS messages (name TEXT, email TEXT, url TEXT, message TEXT, event_id TEXT, has_met BOOLEAN, code TEXT)";
            db.prepare(create_msgs).run().await?;
            let query = "INSERT INTO messages (name, email, url, message, event_id, has_met, code) VALUES (?, ?, ?, ?, ?, ?, ?)";
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
            let create_msgs = "CREATE TABLE IF NOT EXISTS messages (name TEXT, email TEXT, url TEXT, message TEXT, event_id TEXT, has_met BOOLEAN, code TEXT)";
            let create_res = db.prepare(create_msgs).run().await?;
            if create_res.success() {
                println!("Success");
            } else {
                return Response::error(format!("Error: {}", create_res.error().unwrap()), 500);
            }

            let query = "INSERT INTO messages (name, email, url, message, event_id, has_met, code) VALUES (?, ?, ?, ?, ?, ?, ?)";
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
        .get_async("/listallitems", |_req, ctx| async move {
            let db = ctx.env.d1("DB")?;
            let query = "SELECT * FROM messages";
            let result = db.prepare(query).all().await?;

            if !result.success() {
                return Response::error(format!("Error: {}", result.error().unwrap()), 500);
            }

            let items: Vec<MetSeeItem> = result.results()?;

            let formatted_items: Vec<String> = items
                .into_iter()
                .map(|item| {
                    format!(
                        "Name: {}, Email: {}, URL: {}, Message: {}, Event ID: {}, Has Met: {}, Code: {}",
                        item.name, item.email, item.url, item.message, item.event_id, item.has_met, item.code
                    )
                })
                .collect();

            let response_body = formatted_items.join("\n\n");
            Response::ok(format!("All MetSeeItems:\n\n{}", response_body))
        })
        .run(req, env)
        .await
        // ... (other routes remain unchanged)

}

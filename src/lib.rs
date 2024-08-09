use std::borrow::Borrow;

use serde::{Deserialize, Serialize};
use worker::*;

#[derive(Deserialize, Serialize)]
struct MetSeeItem {
    name: String,
    email: String,
    url: String,
    message: String,
    eventID: String,
    hasMet: bool,
    code: String,
}

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: worker::Context) -> Result<Response> {
    let router = Router::new();

    router
        .get_async("/", |_req, _ctx| async move {
            Response::ok("thebigsasha's 'met you there' / 'see you there' service API")
        })
        .post_async("/collect-email", |mut req, ctx| async move {
            let body = req.json::<MetSeeItem>().await?;

            // Store the message in D1
            let db = ctx.env.d1("met-you-there-dbDB")?;
            let query = "INSERT INTO messages (name, email, url, message, eventID, hasMet, code) VALUES (?, ?, ?, ?, ?, ?, ?)";
            db.prepare(query)
                .bind(&[
                    body.name.into(),
                    body.email.into(),
                    body.url.into(),
                    body.message.into(),
                    body.eventID.into(),
                    body.hasMet.into(),
                    body.code.into(),
                ])?
                .run()
                .await?;

            // Send email using MailChannels
            // let email = Email::new()
            //     .set_from(("noreply@example.com", "Met You There"))
            //     .set_to(body.email.as_str())
            //     .set_subject("Collect Email Confirmation")
            //     .set_html(format!("<p>Hello, {}! You have successfully posted a 'collect email' message to event {}</p>", body.name, body.eventID));

            // email.send().await?;

            Response::ok(format!(
                "Hello! Successfully collected email for event"            ))
        })
        .post_async("/metyouthere", |mut req, ctx| async move {
            let body = req.json::<MetSeeItem>().await?;

            // Store the message in D1
            let db = ctx.env.d1("MET_DB")?;
            let query = "INSERT INTO messages (name, email, url, message, eventID, hasMet, code) VALUES (?, ?, ?, ?, ?, ?, ?)";
            db.prepare(query)
                .bind(&[
                    body.name.into(),
                    body.email.into(),
                    body.url.into(),
                    body.message.into(),
                    body.eventID.into(),
                    body.hasMet.into(),
                    body.code.into(),
                ])?
                .run()
                .await?;

            // Send email using MailChannels
            // let email = Email::new()
            //     .set_from(("noreply@example.com", "Met You There"))
            //     .set_to(body.email.as_str())
            //     .set_subject("Met You There Confirmation")
            //     .set_html(format!("<p>Hello, {}! You have successfully posted a 'met you there' message to event {}</p>", body.name, body.eventID));

            // email.send().await?;

            Response::ok(format!(
                "Hello! You have successfully posted a 'met you there' message to event",
            ))
        })
        // ... (other routes remain unchanged)
        .run(req, env)
        .await
}

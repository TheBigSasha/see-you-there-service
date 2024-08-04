use serde::{Deserialize, Serialize};
use worker::*;

//TODO: https://github.com/cloudflare/workers-rs?tab=readme-ov-file#define-a-durable-object-in-rust

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: worker::Context) -> Result<Response> {
    // Create an instance of the Router, which can use parameters (/user/:name) or wildcard values
    // (/file/*pathname). Alternatively, use `Router::with_data(D)` and pass in arbitrary data for
    // routes to access and share using the `ctx.data()` method.
    let router = Router::new();

    // useful for JSON APIs
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
    router
        .get_async("/", |_req, _ctx| async move {
            Response::ok("thebigsasha's 'met you there' / 'see you there' service API")
        })
        .post_async("/", |mut req, _ctx| async move {
            let body = req.json::<MetSeeItem>().await?;
            Response::ok(format!(
                "Hello, {}! You have successfully posted a 'met you there' message to event {}",
                body.name, body.eventID
            ))
        })
        .run(req, env)
        .await
}

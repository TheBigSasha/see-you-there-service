use serde::{Deserialize, Serialize};
use worker::*;

//TODO: https://github.com/cloudflare/workers-rs?tab=readme-ov-file#define-a-durable-object-in-rust
//TODO: https://mailtrap.io/blog/rust-send-email/
//TODO: D1 database https://github.com/cloudflare/workers-rs?tab=readme-ov-file#d1-databases

#[durable_object]
pub struct MetSeeItem {
    name: String,
    email: String,
    url: String,
    message: String,
    eventID: String,
    hasMet: bool,
    code: String,
    state: State,
    env: Env, // access `Env` across requests, use inside `fetch`
}

#[durable_object]
impl DurableObject for MetSeeItem {
    fn new(state: State, env: Env) -> Self {
        Self {
            name: String::new(),
            email: String::new(),
            url: String::new(),
            message: String::new(),
            eventID: String::new(),
            hasMet: false,
            code: String::new(),
            state: state,
            env,
        }
    }

    async fn fetch(&mut self, _req: Request) -> Result<Response> {
        // do some work when a worker makes a request to this DO
        Response::ok(&format!("event ID {}", self.eventID))
    }
}

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
        .post_async("/collect-email", |mut req, _ctx| async move {
            let body = req.json::<MetSeeItem>().await?;
            Response::ok(format!(
                "Hello, {}! You have successfully posted a 'collect email' message to event {}",
                body.name, body.eventID
            ))
        })
        .post_async("/metyouthere", |mut req, _ctx| async move {
            let body = req.json::<MetSeeItem>().await?;
            Response::ok(format!(
                "Hello, {}! You have successfully posted a 'met you there' message to event {}",
                body.name, body.eventID
            ))
        })
        .on_async("/durable", |_req, ctx| async move {
            let namespace = ctx.durable_object("MET_YOU_THERE_RS_WORKER")?;
            let stub = namespace.id_from_name("A")?.get_stub()?;
            // `fetch_with_str` requires a valid Url to make request to DO. But we can make one up!
            stub.fetch_with_str("http://fake_url.com/messages").await
        })
        .get("/var", |_req, ctx| {
            Response::ok(ctx.var("BUILD_NUMBER")?.to_string())
        })
        .post_async("/kv", |_req, ctx| async move {
            let kv = ctx.kv("MET_YOU_THERE_RS_WORKER")?;

            kv.put("key", "value")?.execute().await?;

            Response::empty()
        })
        .run(req, env)
        .await
}

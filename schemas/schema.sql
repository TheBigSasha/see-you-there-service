drop table if exists met_see_items;
create table met_see_items (
  id integer primary key autoincrement,
  name string,
  email string,
  url string,
  message string,
  event_id string,
  has_met boolean,
  code string,
  locale string
);
create index idx_met_see_items_event_id on met_see_items (event_id);


-- Optionally, uncomment the below query to create data

-- insert into comments (author, body, post_slug)
-- values ("Kristian", "Great post!", "hello-world");

drop table if exists newsletter_subscriptions;
create table newsletter_subscriptions (
  id integer primary key autoincrement,
  email string unique,
  locale string,
  subscribed_at integer,
  is_subscribed boolean,
  unsub_token string unique
);
create index idx_newsletter_subscriptions_email on newsletter_subscriptions (email);
create index idx_newsletter_subscriptions_unsub_token on newsletter_subscriptions (unsub_token);

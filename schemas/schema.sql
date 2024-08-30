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
  locale:string,
);
create index idx_met_see_items_event_id on met_see_items (event_id);


-- Optionally, uncomment the below query to create data

-- insert into comments (author, body, post_slug)
-- values ("Kristian", "Great post!", "hello-world");

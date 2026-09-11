# AKTU Notes

A responsive AKTU B.Tech notes catalogue with Year → Subject → Unit browsing,
search, PDF viewing/downloading, and an administrator portal.

## Live Supabase setup

The frontend is configured with the project’s publishable key in
`supabase-config.js`. This key is safe for browser use because database and
storage access are controlled by Row Level Security policies.

1. In Supabase Dashboard, open **SQL Editor** and run the full contents of
   `supabase/schema.sql` once.
2. Open the website’s **Admin portal**, enter an email and a strong password,
   and choose **Create this account**.
3. In SQL Editor, run the final commented `update public.profiles ...` command
   from `schema.sql`, replacing the placeholder with that email.

That account can add/delete subjects and units, and upload PDFs. Everyone else
can browse and download published notes. PDFs are stored in Supabase Storage,
so refreshing the site will not remove them.

Never put a Supabase `service_role` key into this static website.

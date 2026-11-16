-- MONEX Academy — starter ideas for testing (safe to run more than once).
-- These are "MONEX Originals" (source = 'monex', no author). Earnings are
-- rough estimates for testing, not guarantees.

insert into public.ideas (
  slug, title, short_description, category_id, investment_range,
  earning_min, earning_max, difficulty, time_to_first_income, work_mode, team_mode,
  looking_for_roles, launch_plan, market_analysis, risks, source, status, published_at
) values
(
  'freelance-copywriting-local-shops', 'Freelance copywriting for local shops',
  'Write product descriptions, menus and social posts for small local businesses that have no in-house writer.',
  (select id from public.categories where slug = 'services'), '0', 800, 2500,
  'easy', '1_4w', 'online', 'solo', '{}',
  '["Pick a niche, for example cafes or hair salons","Write three sample pieces for free and post them on a simple portfolio page","Contact 20 local businesses per week with a short offer","Agree on a fixed price per package and a delivery date","Deliver, ask for a review, and repeat with the next client"]'::jsonb,
  'Many small businesses publish little content because they lack time. Entry prices are low, so clients often hire on trust after a clear sample.',
  'Income depends on client volume and can be irregular. Keep a small reserve and avoid promising rankings or sales results.',
  'monex', 'approved', now()
),
(
  'niche-directory-website', 'Niche directory website',
  'Build a searchable directory for one narrow topic and earn from listings and sponsored placements.',
  (select id from public.categories where slug = 'online-business'), '100_1000', 200, 1500,
  'medium', '1_3m', 'online', 'solo', '{}',
  '["Choose a topic with many local or specialist providers","Build a simple directory with no-code tools and a contact form","Collect 30 listings by hand before promoting the site","Offer a paid featured listing with a fixed monthly price","Review traffic and listing sales every month"]'::jsonb,
  'Directories earn from listing fees and sponsorships. Their value depends on how complete and up to date the listings are.',
  'Traffic can take months to build. Listings can go stale quickly and need regular checking.',
  'monex', 'approved', now()
),
(
  'real-estate-photo-service', 'Real-estate photo service',
  'Take clean, bright photos of rental and sale listings for local agents and landlords.',
  (select id from public.categories where slug = 'services'), '1000_5000', 1500, 4000,
  'medium', '1_4w', 'irl', 'solo', '{}',
  '["Buy a mid-range camera or a good phone kit and a tripod","Shoot three test listings and edit them for a consistent look","Approach local agencies with a sample set and a price list","Book shoots in batches to reduce travel time","Add editing and virtual tour options as the business grows"]'::jsonb,
  'Agents need listing photos to sell or rent faster. Demand is steady in cities with many listings.',
  'Equipment costs and travel add up. Agencies may negotiate hard on price in slow months.',
  'monex', 'approved', now()
),
(
  'short-video-editing-for-coaches', 'Short-form video editing for coaches',
  'Edit short vertical videos for coaches and consultants who record content but do not have time to edit it.',
  (select id from public.categories where slug = 'content-media'), '0', 500, 3000,
  'easy', '1_4w', 'online', 'solo', '{}',
  '["Learn to cut clips and add captions in a free editor","Edit three sample reels from public videos you have permission to use","Offer a monthly package with a fixed number of videos","Find clients through LinkedIn and creator communities","Ask for a testimonial after the first month"]'::jsonb,
  'Coaches post more short video than ever, and editing is a common bottleneck for them.',
  'Work can be repetitive. Clients may cancel monthly packages, so keep a steady pipeline of prospects.',
  'monex', 'approved', now()
),
(
  'niche-shopify-store', 'Niche Shopify store',
  'Sell a small range of products to one specific audience with a focused brand and a simple checkout.',
  (select id from public.categories where slug = 'e-commerce'), '1000_5000', 1000, 8000,
  'hard', '3_6m', 'online', 'team', array['Designer', 'Marketer'],
  '["Research one audience and three to five products they already buy","Validate demand with a pre-order page before buying stock","Set up the store, brand and product photos","Test two paid ad angles with a small fixed budget","Track margin per product and cut the weakest items"]'::jsonb,
  'Niche stores can compete on focus and brand rather than price. Margins depend on product cost and shipping.',
  'Advertising costs can rise quickly and eat margin. Stock and returns carry real financial risk.',
  'monex', 'approved', now()
),
(
  'pop-up-coffee-cart', 'Pop-up coffee cart',
  'Run a mobile coffee cart at markets, events and office lobbies with a short, focused menu.',
  (select id from public.categories where slug = 'local-business'), '5000_20000', 2000, 10000,
  'hard', '3_6m', 'irl', 'team', array['Barista', 'Marketer'],
  '["Check local permits and food-safety rules before you buy anything","Test the menu at two weekend markets with a borrowed setup","Choose a cart or trailer that fits the local rules","Build a schedule of recurring events and office deliveries","Review sales per event and drop the slowest locations"]'::jsonb,
  'Event and office coffee has repeat demand. A mobile setup keeps fixed costs lower than a shop.',
  'Weather, permits and event fees can change income quickly. Equipment and staffing are significant costs.',
  'monex', 'approved', now()
)
on conflict (slug) do nothing;

insert into public.idea_skills (idea_id, skill_id)
select i.id, s.id
from (values
  ('freelance-copywriting-local-shops', 'copywriting'),
  ('freelance-copywriting-local-shops', 'seo'),
  ('niche-directory-website', 'no-code-tools'),
  ('real-estate-photo-service', 'photography'),
  ('short-video-editing-for-coaches', 'video-editing'),
  ('short-video-editing-for-coaches', 'social-media-marketing'),
  ('niche-shopify-store', 'web-development'),
  ('niche-shopify-store', 'graphic-design'),
  ('pop-up-coffee-cart', 'social-media-marketing')
) as v(idea_slug, skill_slug)
join public.ideas i on i.slug = v.idea_slug
join public.skills s on s.slug = v.skill_slug
on conflict do nothing;

insert into public.idea_checklist_items (idea_id, position, text)
select i.id, (x.ord - 1)::integer, x.txt
from public.ideas i, jsonb_array_elements_text(i.launch_plan) with ordinality as x(txt, ord)
where i.source = 'monex'
on conflict (idea_id, position) do nothing;

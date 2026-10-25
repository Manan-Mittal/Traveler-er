# Place data and reviews

Notes from October 2026 on where place data comes from, why some spots are missing, and which review sources fit the $0 rule.

## Why spots go missing

- **The Taiwan sample is hand-written**, not looked up, so nothing there is lost to OpenStreetMap. It was a trimmed copy of the real itinerary. Spots from the real plan that were left out (Yancheng old streets, Quanji Temple trailhead, Thirteen Levels) are now in `worker/src/sample.ts`.
- **Pins were hiding each other.** Most sample areas sit on exactly the same point as their first stop, so the stop pin was drawn under the area pin. The map now fans out overlapping pins.
- **Search (Photon) only knows OpenStreetMap.** In Taiwan OSM is good for landmarks, temples, stations and night markets, but thin on small cafés and restaurants, and many places only have a Chinese name. Two changes help: results now ask Photon for English names (`lang=en`), and pasting a full Google Maps place link into any search box drops a pin at that exact spot. Short `maps.app.goo.gl` links carry no location, so the app asks for the full link.

## Review sources

| Source | Free? | Fits this app? |
|---|---|---|
| **Google Places API (New)** | Free monthly quota per SKU, but reviews are in the most expensive tier (about 1,000 free calls a month) and a billing account with a card is required. | Not without manan's OK. Google's terms bar showing Places content alongside a non-Google map, and this app uses MapLibre. Reviews also can't be cached. |
| **Yelp Fusion API** | No. Yelp ended the free tier in 2024; after a short trial it's a paid plan. | No. Coverage in Taiwan is also very thin. |
| **Tripadvisor Content API** | About 5,000 free calls a month, card required, up to 5 reviews per place with mandatory branding. | Possible later, but card-on-file billing risk. |
| **Foursquare Places API** | Free tier covers basic place search; ratings, tips and photos are paid "premium" fields. | Could improve search coverage, not reviews. |
| **Outbound links** | Free, no keys, no terms issues. | **Shipped.** Every stop links to its Google and Tripadvisor results, plus Yelp for food and cafés. |

If manan wants ratings shown inline later, the safest path is a Worker endpoint calling Google Places with a hard daily quota set in Google Cloud so it can't bill, showing only rating and count with Google attribution. That still needs the map question above settled first.

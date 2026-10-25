// The Taiwan sample trip, served only to signed-in users so the itinerary isn't in the public site bundle.
// The web app turns this into an editable trip (web/src/sample.ts).

type Category = 'sight' | 'food' | 'cafe' | 'nature' | 'shop' | 'stay' | 'transit' | 'other'
type P = [name: string, lat: number, lon: number, category: Category, why?: string]
type Z = { name: string; lat: number; lon: number; walk?: 15 | 30 | 45 | 60; by?: 'transit' | 'drive'; stops?: P[] }
type D = { title: string; city: string; zones: Z[]; notes?: string }

const CITIES: Record<string, [number, number]> = {
  Taipei: [25.0478, 121.517],
  Kaohsiung: [22.6273, 120.3014],
  Tainan: [22.9971, 120.2127],
  Alishan: [23.5098, 120.803],
  Jiufen: [25.1093, 121.8443],
}

const TAIPEI_MAIN: Z = { name: 'Taipei Main Station', lat: 25.0478, lon: 121.517, walk: 15 }

const DAYS: D[] = [
  {
    title: 'Arrive in Taipei',
    city: 'Taipei',
    notes: 'Airport MRT Express to Taipei Main, about 36 minutes.',
    zones: [{ name: 'Zhongshan', lat: 25.0527, lon: 121.5203, stops: [['Ningxia Night Market', 25.056, 121.5153, 'food', 'Small, local, easy first night']] }],
  },
  {
    title: 'Dadaocheng and Huashan',
    city: 'Taipei',
    zones: [
      {
        name: 'Dadaocheng',
        lat: 25.056,
        lon: 121.51,
        stops: [
          ['Dihua Street', 25.056, 121.51, 'shop', 'Old merchant street, dried goods and tea'],
          ['Taipei Xia-Hai City God Temple', 25.0557, 121.5101, 'sight', 'Matchmaker god, tiny and busy'],
          ['Ri Xing Type Foundry', 25.0526, 121.5163, 'sight', 'Last traditional Chinese type foundry; by appointment'],
        ],
      },
      { name: 'Huashan 1914', lat: 25.0441, lon: 121.5294, by: 'transit', stops: [['Huashan 1914 Creative Park', 25.0441, 121.5294, 'sight'], ['Simple Kaffa', 25.0443, 121.5298, 'cafe', 'Specialty coffee']] },
    ],
  },
  {
    title: "Da'an and Xinyi",
    city: 'Taipei',
    zones: [
      { name: 'Yongkang Street', lat: 25.033, lon: 121.5297, stops: [['Yongkang Street', 25.033, 121.5297, 'food'], ['Din Tai Fung Xinyi', 25.0335, 121.53, 'food']] },
      { name: 'Xinyi', lat: 25.0339, lon: 121.5645, by: 'transit', stops: [['Taipei 101', 25.0339, 121.5645, 'sight'], ['Elephant Mountain', 25.0273, 121.5767, 'nature', 'Short steep climb, best at sunset']] },
    ],
  },
  {
    title: 'Wanhua and Raohe',
    city: 'Taipei',
    zones: [
      { name: 'Wanhua', lat: 25.0372, lon: 121.4999, stops: [['Longshan Temple', 25.0372, 121.4999, 'sight']] },
      { name: 'Songshan', lat: 25.0509, lon: 121.5776, by: 'transit', stops: [['Raohe Night Market', 25.0509, 121.5776, 'food']] },
    ],
  },
  {
    title: 'Palace Museum',
    city: 'Taipei',
    zones: [{ name: 'Shilin', lat: 25.1024, lon: 121.5485, stops: [['National Palace Museum', 25.1024, 121.5485, 'sight']] }],
  },
  {
    title: 'High-speed rail to Kaohsiung',
    city: 'Kaohsiung',
    notes: 'Take an early HSR to Zuoying, then the Red line south.',
    zones: [
      TAIPEI_MAIN,
      {
        name: 'Pier-2',
        lat: 22.62,
        lon: 120.2817,
        walk: 45,
        by: 'transit',
        stops: [
          ['Pier-2 Art Center', 22.62, 120.2817, 'sight'],
          ['Dome of Light', 22.6315, 120.302, 'sight', 'Inside Formosa Boulevard station'],
          ['Liuhe Night Market', 22.6328, 120.2995, 'food'],
          ['Yancheng Old Streets', 22.6245, 120.2848, 'shop', 'Old harbor district next to Pier-2, snacks and shophouses'],
        ],
      },
      { name: 'Cijin Island', lat: 22.6149, lon: 120.2655, by: 'transit', stops: [['Cijin Lighthouse', 22.6149, 120.2655, 'sight', 'Five-minute ferry from Gushan']] },
    ],
  },
  {
    title: 'Train to Tainan',
    city: 'Tainan',
    notes: 'Early TRA from Kaohsiung Main, about 40 minutes.',
    zones: [
      { name: 'Formosa Boulevard', lat: 22.6315, lon: 120.302, walk: 15 },
      {
        name: 'West Central Tainan',
        lat: 22.996,
        lon: 120.201,
        by: 'transit',
        stops: [
          ['Chihkan Tower', 22.9975, 120.2025, 'sight'],
          ['Grand Mazu Temple', 22.997, 120.201, 'sight'],
          ['Confucius Temple', 22.9907, 120.2045, 'sight'],
          ['Guohua Street', 22.994, 120.1975, 'food', 'Beef soup and snacks, go before they sell out'],
          ['Shennong Street', 22.9975, 120.1965, 'shop'],
        ],
      },
      {
        name: 'Anping',
        lat: 23.0015,
        lon: 120.1606,
        by: 'drive',
        stops: [
          ['Anping Old Fort', 23.0015, 120.1606, 'sight'],
          ['Anping Tree House', 23.0034, 120.1597, 'sight'],
          ['Yuguang Island', 22.9775, 120.155, 'nature', 'Sunset beach, around 5:20 PM in November'],
        ],
      },
    ],
  },
  {
    title: 'Up to the Alishan foothills',
    city: 'Alishan',
    notes: 'Shalun line to HSR Tainan, HSR to Chiayi, then a booked taxi up Route 18.',
    zones: [
      { name: 'West Central Tainan', lat: 22.996, lon: 120.201, walk: 15 },
      { name: 'Chiayi HSR', lat: 23.4594, lon: 120.3236, walk: 15, by: 'transit' },
      { name: 'Fanlu', lat: 23.468, lon: 120.628, by: 'drive' },
    ],
  },
  {
    title: 'Alishan, then back to Taipei',
    city: 'Alishan',
    zones: [
      { name: 'Fanlu', lat: 23.468, lon: 120.628, walk: 15 },
      { name: 'Alishan Forest', lat: 23.5098, lon: 120.803, by: 'drive', stops: [['Alishan Forest Recreation Area', 23.5098, 120.803, 'nature'], ['Zhushan Sunrise Viewpoint', 23.5131, 120.8145, 'nature']] },
      { ...TAIPEI_MAIN, by: 'transit' },
    ],
  },
  {
    title: 'Jiufen overnight',
    city: 'Jiufen',
    notes: 'TRA to Ruifang, then a short taxi up. Bring an overnight bag only.',
    zones: [
      TAIPEI_MAIN,
      { name: 'Jiufen', lat: 25.1093, lon: 121.8443, by: 'transit', stops: [['Jiufen Old Street', 25.1093, 121.8443, 'shop', 'Best after the day-trippers leave'], ['A-Mei Tea House', 25.1091, 121.8449, 'cafe']] },
    ],
  },
  {
    title: 'Teapot Mountain and Jinguashi',
    city: 'Jiufen',
    zones: [
      {
        name: 'Jinguashi',
        lat: 25.108,
        lon: 121.8577,
        stops: [
          ['Quanji Temple, Teapot Mountain trailhead', 25.1063, 121.8634, 'nature', 'Bus 788 stops here. About 1 to 1.5 hours round trip, lots of steps'],
          ['Gold Museum', 25.108, 121.8577, 'sight'],
          ['Yin-Yang Sea', 25.121, 121.864, 'nature'],
          ['Thirteen Levels ruins', 25.1206, 121.8605, 'sight', 'Old copper smelter terraces above Shuinandong'],
        ],
      },
      { ...TAIPEI_MAIN, by: 'transit' },
    ],
  },
  {
    title: 'Beitou hot springs',
    city: 'Taipei',
    zones: [
      {
        name: 'Xinbeitou',
        lat: 25.137,
        lon: 121.503,
        stops: [
          ['Beitou Hot Spring Museum', 25.1365, 121.507, 'sight'],
          ['Beitou Public Library', 25.1361, 121.5054, 'sight'],
          ['Thermal Valley', 25.1376, 121.5115, 'nature'],
          ['Grand View Resort Beitou', 25.1395, 121.5115, 'other', 'Private hot spring rooms in 90-minute sessions'],
        ],
      },
    ],
  },
  { title: 'Fly home', city: 'Taipei', zones: [{ name: 'Taoyuan Airport', lat: 25.0797, lon: 121.2342, walk: 15 }] },
]

const BOOKINGS: [title: string, kind: 'train' | 'restaurant' | 'ticket' | 'other', deadline: string | undefined, day: number | undefined][] = [
  ['HSR Taipei to Zuoying', 'train', '2026-10-17', 5],
  ['TRA Kaohsiung to Tainan', 'train', undefined, 6],
  ['HSR Chiayi to Taipei', 'train', '2026-10-20', 8],
  ['Taxi from Chiayi HSR up to Fanlu', 'other', undefined, 7],
  ['Dinner reservation in Anping', 'restaurant', '2026-11-01', 6],
  ['Private hot spring room, Beitou', 'ticket', undefined, 11],
  ['Jiufen lantern rental', 'ticket', undefined, 9],
]

export const SAMPLE = { start: '2026-11-09', cities: CITIES, days: DAYS, bookings: BOOKINGS }

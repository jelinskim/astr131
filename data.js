/* ============================================================================
   data.js  -  The ONLY file you edit to add or change constellations.

   HOW TO ADD ONE:
     1) Make a folder named after the "slug" inside images/, and put your photo
        pair(s) in it. Each photo is a pair - one without lines, one with:
            images/<slug>/V1.png       <- photo 1, WITHOUT lines
            images/<slug>/V1Lines.png  <- photo 1, WITH lines
        For extra photos (different orientations/locations) just add more pairs:
            images/<slug>/V2.png, images/<slug>/V2Lines.png, V3…, up to V20.
        The quiz shows a random photo each time; V1 is the atlas thumbnail.
     2) Add an entry below. Only `slug` and `name` are required. If a
        constellation has more than one photo, set `versions` to the count.
        Then commit & push.

   TIP: You never have to hand-edit this file - use the "Manage" tab (it can
   auto-fill coordinates from a place name and set the photo count), click
   "Export data.js", and drop the download in here.

   OPTIONAL FIELDS:
     week           number   groups items (powers the "by week" quiz filters)
     abbr           string   IAU abbreviation, e.g. "UMa"
     hemisphere     string   "Northern" | "Southern" | "Equatorial"
     location       string   where the observation was made
     lat / lon      number   coordinates of that location (decimal degrees)
     versions       number   how many photo pairs exist (V1..Vn); defaults to 1
     notes          string   short blurb shown after answering / on the card
     ext            string   image extension if not "png"
============================================================================ */

window.CONSTELLATIONS = [
  {
    slug: "ursa_major",
    name: "Ursa Major",
    week: 1,
    abbr: "UMa",
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Ursa Major, the Great Bear, is one of the largest and most recognizable constellations in the northern sky. Seven of its brightest stars form the Big Dipper, an asterism commonly used to locate Polaris and several other stars and constellations."
  },
  {
    slug: "ursa_minor",
    name: "Ursa Minor",
    week: 1,
    abbr: "UMi",
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Ursa Minor, the Little Bear, contains the group of stars known as the Little Dipper. Polaris is located at the end of its handle and lies very close to the north celestial pole, making the constellation an important guide for finding north."
  },
  {
    slug: "cassiopeia",
    name: "Cassiopeia",
    week: 1,
    abbr: "Cas",
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Cassiopeia represents a queen from Greek mythology and is easily recognized by its five bright stars forming a W or M shape. From Michigan, it is circumpolar, meaning it circles the north celestial pole and remains visible throughout the year."
  },
  {
    slug: "cepheus",
    name: "Cepheus",
    week: 1,
    abbr: "Cep",
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Cepheus represents the king of ancient Greek mythology and is often identified by its house-like shape. It contains Delta Cephei, the star used to define Cepheid variables, whose predictable changes in brightness help astronomers measure distances across space. In the planetarium, Doctor Swift zig-zags where some versions of the constellation show wavy robes."
  },
  {
    slug: "draco_dragon",
    name: "Draco",
    week: 1,
    abbr: "Dra",
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Draco, the Dragon, forms a long twisting path of stars that winds between Ursa Major and Ursa Minor. Its star Thuban was once the closest bright star to the north celestial pole and served as the North Star around 3000 BCE."
  },
  {
    slug: "pegasus",
    name: "Pegasus",
    week: 1,
    abbr: "Peg",
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Pegasus represents the winged horse of Greek mythology. Its most recognizable feature is the Great Square of Pegasus, a large pattern of four stars that serves as a useful starting point for locating Andromeda and other autumn constellations."
  },
  {
    slug: "andromeda",
    name: "Andromeda",
    week: 1,
    abbr: "And",
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Andromeda represents a princess from Greek mythology and extends outward from the Great Square of Pegasus. The constellation contains the Andromeda Galaxy, or M31, the nearest large galaxy to the Milky Way and one of the farthest objects visible without a telescope."
  },
  {
    slug: "perseus",
    name: "Perseus",
    week: 1,
    abbr: "Per",
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Perseus represents the Greek hero who rescued Andromeda. The constellation contains the variable star Algol, the Double Cluster, and the radiant of the Perseid meteor shower, which appears each year when Earth passes through debris left by Comet Swift-Tuttle."
  },
  {
    slug: "polaris",
    name: "Polaris",
    week: 1,
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Polaris, commonly called the North Star, is located at the end of the Little Dipper's handle. Because it lies very close to the north celestial pole, it appears almost stationary while the other stars seem to rotate around it, making it a reliable guide for finding north."
  },
  {
    slug: "pointer_stars",
    name: "Pointer Stars",
    week: 1,
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Dubhe and Merak are known as the Pointer Stars because they form the outer edge of the Big Dipper's bowl and draw an imaginary line pointing to Polaris / Ursa Minor."
  },
  {
    slug: "mizar_alcor",
    name: "Mizar & Alcor",
    week: 1,
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Mizar and Alcor appear close together at the bend of the Big Dipper's handle and can be separated with good eyesight. Once they were used as a test of vision in the Middle Ages, where passing the test meant you were fit to be an archer in the military."
  },
  {
    slug: "algol",
    name: "Algol",
    week: 1,
    hemisphere: "Northern",
    location: "Dearborn, Michigan, USA",
    lat: 42.3223,
    lon: -83.1763,
    notes: "Algol, also known as Beta Persei or the Demon Star, is a variable star in the constellation Perseus. It is an eclipsing binary system whose brightness noticeably decreases about every 2.87 days when one star passes in front of the other."
  }
];

/* Global settings - you almost never need to change these. */
window.QUIZ_CONFIG = {
  imageDir: "images",
  imageExt: "png",
  linesSuffix: "_lines"
};

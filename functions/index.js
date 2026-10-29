'use strict';

const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');

initializeApp();
const db=getFirestore();

const CLASSES={
 archer:{name:'Archer',hp:90,atk:12},
 warrior:{name:'Warrior',hp:130,atk:24},
 guardian:{name:'Guardian',hp:170,atk:28},
 mage:{name:'Mage',hp:80,atk:18},
 assassin:{name:'Assassin',hp:85,atk:16},
 lancer:{name:'Lancer',hp:115,atk:21}
};

const CLASS_IDS=Object.keys(CLASSES),GENDERS=['m','f'];

const ROLE_LIMITS={
 'Guild Leader':1,
 'Vice Leader':1,
 'Commander':3,
 'Captain':7,
 'Elite':8,
 'Member':30
};

const ROLE_NAMES=Object.keys(ROLE_LIMITS);

const CONTINENTS=[
 'aetherion',
 'frostheim',
 'drakthar',
 'sylvaris',
 'dunemara',
 'thalassara',
 'umbraxis'
];

const BIOMES=[
 'Aetherion',
 'Frostheim',
 'Drakthar',
 'Sylvaris',
 'Dunemara',
 'Thalassara',
 'Umbraxis'
];

const UPGRADE_BASE={
 dmg:120,
 hp:110,
 spd:100,
 gold:140,
 mag:90
};

const UPGRADE_MAX=8;

const OFFLINE_ITEMS=require('./catalog_items.json');

const CATALOG={};

for(const x of OFFLINE_ITEMS){
 CATALOG[x.id]={...x,cat:'items',sellable:true};
}

CATALOG.dungeon_scroll={
 id:'dungeon_scroll',
 name:'Dungeon Scroll',
 price:260,
 cat:'items',
 sellable:true
};

CATALOG.tournament_scroll={
 id:'tournament_scroll',
 name:'Tournament Scroll',
 price:300,
 cat:'items',
 sellable:true
};

CATALOG.bundle_chest={
 id:'bundle_chest',
 name:'Bundle Chest',
 price:0,
 cat:'bundleChest',
 sellable:false
};

const WN={
 archer:[
  'Oak Shortbow',
  'Hunter’s Longbow',
  'Elven Recurve',
  'Dragonbone Bow',
  'Starfall Bow'
 ],
 warrior:[
  'Rusty Shortsword',
  'Iron Longsword',
  'Steel Claymore',
  'Flameberge',
  'Dawnbreaker'
 ],
 guardian:[
  'Oak Club & Buckler',
  'Iron Mace & Kite Shield',
  'Spiked Morningstar & Heater',
  'Titan Warhammer & Tower Shield',
  'Worldbreaker & Aegis'
 ],
 mage:[
  'Apprentice Staff',
  'Oakheart Staff',
  'Crystal Staff',
  'Archmage Staff',
  'Starweaver Staff'
 ],
 assassin:[
  'Rusty Daggers',
  'Steel Stilettos',
  'Venom Fangs',
  'Shadow Kris',
  'Nightbane Blades'
 ],
 lancer:[
  'Wooden Spear',
  'Iron Pike',
  'Steel Glaive',
  'Wyvern Lance',
  'Skypiercer'
 ]
};

const WP=[0,160,420,1000,2400];

for(const [cls,names] of Object.entries(WN)){
 names.forEach((name,i)=>{
  const id=`w_${cls}_${i}`;

  CATALOG[id]={
   id,
   name,
   price:WP[i],
   cat:'weapons',
   cls,
   slot:'weaponId',
   sellable:i>0
  };
 });
}

const OA_NAMES={
 helmet:[
  'Scout Hood',
  'Iron Helm',
  'Runic Crown',
  'Dragon Helm',
  'Celestial Crown'
 ],
 chest:[
  'Leather Cuirass',
  'Knight Plate',
  'Runic Aegis',
  'Dragonlord Mail',
  'Celestial Plate'
 ],
 leggings:[
  'Trail Leggings',
  'Iron Greaves',
  'Runic Legguards',
  'Dragon Greaves',
  'Celestial Legguards'
 ],
 boots:[
  'Traveler Boots',
  'Iron Sabatons',
  'Runic Boots',
  'Dragonstep Boots',
  'Celestial Boots'
 ]
};

const OA_PRICE=[120,420,1050,2600,6200];

Object.entries(OA_NAMES).forEach(([slot,names],si)=>{
 names.forEach((name,i)=>{
  const id=`oa_${slot}_${i}`;

  CATALOG[id]={
   id,
   name,
   price:OA_PRICE[i]+si*35,
   cat:'armors',
   slot,
   sellable:true
  };
 });
});

const ACC_SETS={
 wings:[
  'Windrunner Wings',
  'Aegis Wings',
  'Ember Wings',
  'Frost Wings',
  'Astral Wings'
 ],
 ring:[
  'Keen Ring',
  'Titan Ring',
  'Fortune Ring',
  'Ward Ring',
  'Eclipse Ring'
 ],
 necklace:[
  'Vital Necklace',
  'Sage Necklace',
  'Ward Necklace',
  'Hunter Necklace',
  'Phoenix Necklace'
 ],
 earrings:[
  'Hawkeye Earrings',
  'Storm Earrings',
  'Guardian Earrings',
  'Oracle Earrings',
  'Void Earrings'
 ],
 bracelet:[
  'Swift Bracelet',
  'Iron Bracelet',
  'Renewal Bracelet',
  'Berserker Bracelet',
  'Celestial Bracelet'
 ]
};

Object.entries(ACC_SETS).forEach(([slot,names])=>{
 names.forEach((name,i)=>{
  const id=`acc_${slot}_${i}`;

  CATALOG[id]={
   id,
   name,
   price:350+i*550,
   cat:'accessories',
   slot,
   sellable:true
  };
 });
});

function authUid(req){
 if(!req.auth){
  throw new HttpsError(
   'unauthenticated',
   'Sign in is required.'
  );
 }

 return req.auth.uid;
}

function clean(v){
 if(v==null)return v;

 if(v instanceof Timestamp){
  return v.toMillis();
 }

 if(Array.isArray(v)){
  return v.map(clean);
 }

 if(typeof v==='object'){
  const o={};

  for(const [k,x] of Object.entries(v)){
   o[k]=clean(x);
  }

  return o;
 }

 return v;
}

function nameOk(v){
 return typeof v==='string' &&
 /^[A-Za-z0-9]{5,13}$/.test(v);
}

function guildNameOk(v){
 return typeof v==='string' &&
 /^[A-Za-z0-9]{8,13}$/.test(v);
}

function guildSignOk(v){
 return typeof v==='string' &&
 /^[A-Za-z0-9]{3,4}$/.test(v);
}

function titleNameOk(v){
 return typeof v==='string' &&
 v.trim().length>=1 &&
 v.trim().length<=40 &&
 /^[A-Za-z][A-Za-z .'-]*$/.test(v.trim());
}

function norm(v){
 return String(v||'').trim().toLowerCase();
}

function dayKey(d=new Date()){
 return d.toISOString().slice(0,10);
}

function nowMs(){
 return Date.now();
}

function randInt(a,b){
 return Math.floor(a+Math.random()*(b-a+1));
}

function ensureInv(u){
 u.inventory=u.inventory||{};

 for(const k of [
  'items',
  'armors',
  'weapons',
  'accessories',
  'bundleChest'
 ]){
  u.inventory[k]=u.inventory[k]||{};
 }

 u.equipment=u.equipment||{
  weaponId:null,
  helmet:null,
  chest:null,
  leggings:null,
  boots:null,
  wings:null,
  necklace:null,
  earrings:null,
  bracelet:null,
  ring:null
 };

 u.currencies=u.currencies||{
  gold:0,
  gems:0
 };

 u.upgrades=u.upgrades||{
  dmg:0,
  hp:0,
  spd:0,
  gold:0,
  mag:0
 };

 u.tournamentStats=u.tournamentStats||{
  wins:0,
  losses:0,
  ties:0,
  rank:0
 };

 u.dungeonProgress=u.dungeonProgress||{
  highestFloor:0,
  completedFloors:[]
 };

 return u;
}

function distinctCount(obj){
 return Object.values(obj||{})
 .filter(n=>+n>0)
 .length;
}

function addItem(u,cat,id,n){
 ensureInv(u);

 const bag=u.inventory[cat]||{};

 if(!bag[id]&&distinctCount(bag)>=50){
  throw new HttpsError(
   'failed-precondition',
   `${cat} inventory is full.`
  );
 }

 bag[id]=(+bag[id]||0)+n;

 if(bag[id]<=0){
  delete bag[id];
 }

 u.inventory[cat]=bag;
}

function profilePayload(u,uid){
 return clean({...u,uid});
}

async function getUser(uid){
 const s=await db.doc(`users/${uid}`).get();

 if(!s.exists){
  throw new HttpsError(
   'not-found',
   'Player profile not found.'
  );
 }

 return{
  ref:s.ref,
  data:ensureInv(s.data())
 };
}

function equippedIds(u){
 return new Set(
  Object.values(u.equipment||{})
  .filter(Boolean)
 );
}


/* =========================================================
   SHOP PURCHASE
   ========================================================= */

exports.purchaseItem=onCall(async req=>{
 const uid=authUid(req);

 const id=String(
  req.data.itemId||''
 );

 const qty=Math.max(
  1,
  Math.min(
   99,
   +req.data.quantity||1
  )
 );

 const it=CATALOG[id];

 if(!it||it.price<=0){
  throw new HttpsError(
   'invalid-argument',
   'Item cannot be purchased.'
  );
 }

 const ref=db.doc(`users/${uid}`);

 let out;

 await db.runTransaction(async tx=>{
  const s=await tx.get(ref);

  if(!s.exists){
   throw new HttpsError(
    'not-found',
    'Player not found.'
   );
  }

  const u=ensureInv(s.data());

  if(
   it.cls &&
   u.character &&
   u.character.classId!==it.cls
  ){
   throw new HttpsError(
    'failed-precondition',
    'That weapon is not compatible with your class.'
   );
  }

  const cost=it.price*qty;

  if((+u.currencies.gold||0)<cost){
   throw new HttpsError(
    'failed-precondition',
    'Not enough Gold.'
   );
  }

  addItem(
   u,
   it.cat,
   id,
   qty
  );

  u.currencies.gold-=cost;

  tx.set(ref,u);

  out=profilePayload(
   u,
   uid
  );
 });

 return{
  profile:out
 };
});


/* =========================================================
   SELL ITEM
   ========================================================= */

exports.sellItem=onCall(async req=>{
 const uid=authUid(req);

 const id=String(
  req.data.itemId||''
 );

 const cat=String(
  req.data.category||''
 );

 const qty=Math.max(
  1,
  Math.min(
   99,
   +req.data.quantity||1
  )
 );

 const it=CATALOG[id];

 if(
  !it ||
  !it.sellable ||
  it.cat!==cat
 ){
  throw new HttpsError(
   'invalid-argument',
   'Item cannot be sold.'
  );
 }

 const ref=db.doc(`users/${uid}`);

 let out;

 await db.runTransaction(async tx=>{
  const s=await tx.get(ref);

  const u=ensureInv(
   s.data()
  );

  if(equippedIds(u).has(id)){
   throw new HttpsError(
    'failed-precondition',
    'Unequip this item before selling it.'
   );
  }

  if(
   (+u.inventory[cat][id]||0)<qty
  ){
   throw new HttpsError(
    'failed-precondition',
    'Not enough quantity.'
   );
  }

  addItem(
   u,
   cat,
   id,
   -qty
  );

  u.currencies.gold+=(
   Math.max(
    1,
    Math.floor(it.price*.5)
   )*qty
  );

  tx.set(
   ref,
   u
  );

  out=profilePayload(
   u,
   uid
  );
 });

 return{
  profile:out
 };
});


/* =========================================================
   EQUIPMENT
   ========================================================= */

exports.equipItem=onCall(async req=>{
 const uid=authUid(req);

 const id=String(
  req.data.itemId||''
 );

 const it=CATALOG[id];

 if(!it||!it.slot){
  throw new HttpsError(
   'invalid-argument',
   'Item cannot be equipped.'
  );
 }

 const ref=db.doc(`users/${uid}`);

 let out;

 await db.runTransaction(async tx=>{
  const s=await tx.get(ref);

  const u=ensureInv(
   s.data()
  );

  if(
   (+u.inventory[it.cat][id]||0)<1
  ){
   throw new HttpsError(
    'failed-precondition',
    'You do not own this item.'
   );
  }

  if(
   it.cls &&
   u.character.classId!==it.cls
  ){
   throw new HttpsError(
    'failed-precondition',
    'Weapon is incompatible with your class.'
   );
  }

  u.equipment[it.slot]=id;

  tx.set(
   ref,
   u
  );

  out=profilePayload(
   u,
   uid
  );
 });

 return{
  profile:out
 };
});


exports.unequipItem=onCall(async req=>{
 const uid=authUid(req);

 const slot=String(
  req.data.slot||''
 );

 if(![
  'weaponId',
  'helmet',
  'chest',
  'leggings',
  'boots',
  'wings',
  'necklace',
  'earrings',
  'bracelet',
  'ring'
 ].includes(slot)){
  throw new HttpsError(
   'invalid-argument',
   'Invalid equipment slot.'
  );
 }

 if(slot==='weaponId'){
  throw new HttpsError(
   'failed-precondition',
   'A weapon must remain equipped.'
  );
 }

 const ref=db.doc(`users/${uid}`);

 let out;

 await db.runTransaction(async tx=>{
  const s=await tx.get(ref);

  const u=ensureInv(
   s.data()
  );

  u.equipment[slot]=null;

  tx.set(
   ref,
   u
  );

  out=profilePayload(
   u,
   uid
  );
 });

 return{
  profile:out
 };
});


/* =========================================================
   UPGRADES
   ========================================================= */

exports.upgradePlayer=onCall(async req=>{
 const uid=authUid(req);

 const id=String(
  req.data.upgradeId||''
 );

 if(!(id in UPGRADE_BASE)){
  throw new HttpsError(
   'invalid-argument',
   'Invalid upgrade.'
  );
 }

 const ref=db.doc(`users/${uid}`);

 let out;

 await db.runTransaction(async tx=>{
  const s=await tx.get(ref);

  const u=ensureInv(
   s.data()
  );

  const lv=
   +u.upgrades[id]||0;

  if(lv>=UPGRADE_MAX){
   throw new HttpsError(
    'failed-precondition',
    'Upgrade is already maxed.'
   );
  }

  const cost=Math.round(
   UPGRADE_BASE[id]*
   (1+lv*.8)
  );

  if(u.currencies.gold<cost){
   throw new HttpsError(
    'failed-precondition',
    'Not enough Gold.'
   );
  }

  u.currencies.gold-=cost;
  u.upgrades[id]=lv+1;

  tx.set(
   ref,
   u
  );

  out=profilePayload(
   u,
   uid
  );
 });

 return{
  profile:out
 };
});


/* =========================================================
   BUNDLE CHEST
   ========================================================= */

exports.openBundleChest=onCall(async req=>{
 const uid=authUid(req);

 const ref=db.doc(
  `users/${uid}`
 );

 let out;
 let rewards=[];

 await db.runTransaction(async tx=>{
  const s=await tx.get(ref);

  const u=ensureInv(
   s.data()
  );

  if(
   (+u.inventory.bundleChest.bundle_chest||0)<1
  ){
   throw new HttpsError(
    'failed-precondition',
    'No Bundle Chest available.'
   );
  }

  addItem(
   u,
   'bundleChest',
   'bundle_chest',
   -1
  );

  const gold=randInt(
   120,
   650
  );

  const gems=randInt(
   2,
   12
  );

  u.currencies.gold+=gold;
  u.currencies.gems+=gems;

  rewards.push({
   name:'Gold',
   amount:gold
  });

  rewards.push({
   name:'Gems',
   amount:gems
  });

  if(Math.random()<.6){
   addItem(
    u,
    'items',
    'dungeon_scroll',
    1
   );

   rewards.push({
    name:'Dungeon Scroll',
    amount:1
   });
  }

  if(Math.random()<.6){
   addItem(
    u,
    'items',
    'tournament_scroll',
    1
   );

   rewards.push({
    name:'Tournament Scroll',
    amount:1
   });
  }

  if(Math.random()<.35){
   const pool=
    Object.values(CATALOG)
    .filter(
     x=>x.cat==='accessories'
    );

   const it=
    pool[
     randInt(
      0,
      pool.length-1
     )
    ];

   addItem(
    u,
    'accessories',
    it.id,
    1
   );

   rewards.push({
    name:it.name,
    amount:1
   });
  }

  tx.set(
   ref,
   u
  );

  out=profilePayload(
   u,
   uid
  );
 });

 return{
  profile:out,
  rewards
 };
});


/* =========================================================
   DAILY QUEST
   ========================================================= */

exports.getDailyQuest=onCall(async req=>{
 const uid=authUid(req);

 const {data:u}=
  await getUser(uid);

 const snap=
  await db
  .collection('dailyQuestRuns')
  .where('uid','==',uid)
  .where('status','==','active')
  .limit(1)
  .get();

 let run=null;

 if(!snap.empty){
  run=clean({
   id:snap.docs[0].id,
   ...snap.docs[0].data()
  });

  run.startedAtMillis=
   snap.docs[0]
   .data()
   .startedAt
   .toMillis();
 }

 return{
  completedToday:
   u.dailyQuest &&
   u.dailyQuest.lastCompletedDay===dayKey(),

  run,

  remainingText:
   run
   ?Math.max(
     0,
     300-Math.floor(
      (nowMs()-run.startedAtMillis)/1000
     )
    )
   :300
 };
});


exports.startDailyQuest=onCall(async req=>{
 const uid=authUid(req);

 const {ref,data:u}=
  await getUser(uid);

 if(
  u.dailyQuest &&
  u.dailyQuest.lastCompletedDay===dayKey()
 ){
  throw new HttpsError(
   'failed-precondition',
   'Daily Quest already completed today.'
  );
 }

 const q=
  await db
  .collection('dailyQuestRuns')
  .where('uid','==',uid)
  .where('status','==','active')
  .limit(1)
  .get();

 if(!q.empty){
  const d=q.docs[0];

  return{
   completedToday:false,

   run:{
    id:d.id,
    ...clean(d.data()),
    startedAtMillis:
     d.data().startedAt.toMillis()
   }
  };
 }

 const hp=
  (
   CLASSES[u.character.classId]||
   CLASSES.archer
  ).hp+
  (+u.upgrades.hp||0)*10;

 const doc=
  db.collection(
   'dailyQuestRuns'
  ).doc();

 const run={
  uid,
  status:'active',
  startedAt:Timestamp.now(),
  lastPulseAt:Timestamp.now(),
  hp,
  maxHp:hp,
  pulses:0,
  kills:0,
  enemyCount:10,
  rewardClaimed:false
 };

 await doc.set(run);

 return{
  completedToday:false,

  run:{
   id:doc.id,
   ...clean(run),
   startedAtMillis:
    run.startedAt.toMillis()
  }
 };
});


exports.dailyQuestPulse=onCall(async req=>{
 const uid=authUid(req);

 const q=
  await db
  .collection('dailyQuestRuns')
  .where('uid','==',uid)
  .where('status','==','active')
  .limit(1)
  .get();

 if(q.empty){
  throw new HttpsError(
   'failed-precondition',
   'No active Daily Quest.'
  );
 }

 const ref=q.docs[0].ref;

 let out;
 let canClaim=false;

 await db.runTransaction(async tx=>{
  const s=await tx.get(ref);

  const r=s.data();
  const now=Timestamp.now();

  if(r.status!=='active'){
   throw new HttpsError(
    'failed-precondition',
    'Challenge is no longer active.'
   );
  }

  if(
   now.toMillis()-
   r.lastPulseAt.toMillis()
   <8000
  ){
   throw new HttpsError(
    'resource-exhausted',
    'Pulse requested too soon.'
   );
  }

  const elapsed=
   (
    now.toMillis()-
    r.startedAt.toMillis()
   )/1000;

  const diff=
   1+
   Math.floor(
    elapsed/60
   );

  const damage=
   randInt(
    2,
    5
   )*diff;

  const kills=
   randInt(
    2,
    5
   )+diff;

  r.hp=Math.max(
   0,
   r.hp-damage
  );

  r.kills+=kills;

  r.enemyCount=Math.min(
   90,
   10+
   diff*8+
   randInt(0,8)
  );

  r.pulses++;
  r.lastPulseAt=now;

  if(r.hp<=0){
   r.status='failed';
  }

  tx.set(
   ref,
   r
  );

  canClaim=
   r.status==='active' &&
   elapsed>=300 &&
   r.pulses>=30;

  out={
   id:ref.id,
   ...clean(r),
   startedAtMillis:
    r.startedAt.toMillis()
  };
 });

 return{
  run:out,
  canClaim
 };
});


exports.claimDailyQuest=onCall(async req=>{
 const uid=authUid(req);

 const q=
  await db
  .collection('dailyQuestRuns')
  .where('uid','==',uid)
  .where('status','==','active')
  .limit(1)
  .get();

 if(q.empty){
  throw new HttpsError(
   'failed-precondition',
   'No active Daily Quest.'
  );
 }

 const runRef=q.docs[0].ref;

 const userRef=
  db.doc(`users/${uid}`);

 let out;

 await db.runTransaction(async tx=>{
  const [rs,us]=
   await Promise.all([
    tx.get(runRef),
    tx.get(userRef)
   ]);

  const r=rs.data();

  const u=ensureInv(
   us.data()
  );

  const elapsed=
   (
    Timestamp.now().toMillis()-
    r.startedAt.toMillis()
   )/1000;

  if(
   r.status!=='active' ||
   r.hp<=0 ||
   elapsed<300 ||
   r.pulses<30 ||
   r.rewardClaimed
  ){
   throw new HttpsError(
    'failed-precondition',
    'Challenge is not eligible for completion.'
   );
  }

  if(
   u.dailyQuest &&
   u.dailyQuest.lastCompletedDay===dayKey()
  ){
   throw new HttpsError(
    'already-exists',
    'Daily reward already claimed.'
   );
  }

  r.status='complete';
  r.rewardClaimed=true;
  r.completedAt=Timestamp.now();

  u.dailyQuest={
   lastCompletedDay:dayKey()
  };

  addItem(
   u,
   'bundleChest',
   'bundle_chest',
   1
  );

  tx.set(
   runRef,
   r
  );

  tx.set(
   userRef,
   u
  );

  out=profilePayload(
   u,
   uid
  );
 });

 return{
  profile:out
 };
});


/* =========================================================
   GUILD DASHBOARD
   ========================================================= */

exports.getGuildDashboard=onCall(async req=>{
 const uid=authUid(req);

 const {data:u}=
  await getUser(uid);

 if(u.guildId){
  const gs=
   await db
   .doc(`guilds/${u.guildId}`)
   .get();

  if(!gs.exists){
   return{
    guild:null,
    guilds:[]
   };
  }

  const ms=
   await db
   .collection(
    `guilds/${u.guildId}/members`
   )
   .orderBy(
    'joinedAt',
    'asc'
   )
   .limit(50)
   .get();

  const members=
   ms.docs.map(
    d=>clean({
     uid:d.id,
     ...d.data()
    })
   );

  const me=
   members.find(
    x=>x.uid===uid
   );

  return{
   guild:{
    id:gs.id,
    ...clean(gs.data())
   },
   members,
   myRole:me&&me.role
  };
 }

 const qs=
  await db
  .collection('guilds')
  .orderBy(
   'memberCount',
   'desc'
  )
  .limit(30)
  .get();

 return{
  guild:null,

  guilds:
   qs.docs.map(
    d=>clean({
     id:d.id,
     ...d.data()
    })
   )
 };
});


/* =========================================================
   CREATE GUILD
   ========================================================= */

exports.createGuild=onCall(async req=>{
 const uid=authUid(req);

 const name=String(
  req.data.name||''
 );

 const sign=String(
  req.data.sign||''
 );

 const nn=norm(name);
 const ns=norm(sign);

 if(
  !guildNameOk(name) ||
  !guildSignOk(sign)
 ){
  throw new HttpsError(
   'invalid-argument',
   'Guild name or sign is invalid.'
  );
 }

 const userRef=
  db.doc(`users/${uid}`);

 const nameRef=
  db.doc(`guildNames/${nn}`);

 const signRef=
  db.doc(`guildSigns/${ns}`);

 const guildRef=
  db.collection('guilds').doc();

 await db.runTransaction(async tx=>{
  const [us,nm,sg]=
   await Promise.all([
    tx.get(userRef),
    tx.get(nameRef),
    tx.get(signRef)
   ]);

  const u=ensureInv(
   us.data()
  );

  if(u.guildId){
   throw new HttpsError(
    'failed-precondition',
    'You already belong to a guild.'
   );
  }

  if(nm.exists||sg.exists){
   throw new HttpsError(
    'already-exists',
    'Guild name or sign is already in use.'
   );
  }

  if(u.currencies.gold<10000){
   throw new HttpsError(
    'failed-precondition',
    'You need 10,000 Gold.'
   );
  }

  u.currencies.gold-=10000;
  u.guildId=guildRef.id;

  const leaderName=
   u.character.inGameName;

  tx.set(
   userRef,
   u
  );

  tx.set(
   nameRef,
   {
    guildId:guildRef.id
   }
  );

  tx.set(
   signRef,
   {
    guildId:guildRef.id
   }
  );

  tx.set(
   guildRef,
   {
    name,
    normalizedName:nn,
    sign,
    normalizedSign:ns,
    leaderUid:uid,
    leaderName,
    memberCount:1,
    capacity:50,
    level:1,
    xp:0,

    roleCounts:{
     'Guild Leader':1,
     'Vice Leader':0,
     'Commander':0,
     'Captain':0,
     'Elite':0,
     'Member':0
    },

    createdAt:Timestamp.now()
   }
  );

  tx.set(
   guildRef
   .collection('members')
   .doc(uid),

   {
    uid,
    inGameName:leaderName,
    level:u.level||1,
    role:'Guild Leader',
    joinedAt:Timestamp.now()
   }
  );
 });

 return{
  ok:true,
  guildId:guildRef.id
 };
});


/* =========================================================
   JOIN GUILD
   ========================================================= */

exports.joinGuild=onCall(async req=>{
 const uid=authUid(req);

 const gid=String(
  req.data.guildId||''
 );

 const userRef=
  db.doc(`users/${uid}`);

 const gref=
  db.doc(`guilds/${gid}`);

 const mref=
  gref.collection('members').doc(uid);

 await db.runTransaction(async tx=>{
  const [us,gs]=
   await Promise.all([
    tx.get(userRef),
    tx.get(gref)
   ]);

  if(!gs.exists){
   throw new HttpsError(
    'not-found',
    'Guild not found.'
   );
  }

  const u=ensureInv(
   us.data()
  );

  const g=gs.data();

  if(u.guildId){
   throw new HttpsError(
    'failed-precondition',
    'You already belong to a guild.'
   );
  }

  if((g.memberCount||0)>=50){
   throw new HttpsError(
    'resource-exhausted',
    'Guild is full.'
   );
  }

  u.guildId=gid;

  g.memberCount=
   (g.memberCount||0)+1;

  g.roleCounts=
   g.roleCounts||{
    'Guild Leader':1,
    'Vice Leader':0,
    'Commander':0,
    'Captain':0,
    'Elite':0,
    'Member':0
   };

  if(
   (g.roleCounts.Member||0)>=
   ROLE_LIMITS.Member
  ){
   throw new HttpsError(
    'resource-exhausted',
    'Member role capacity is full.'
   );
  }

  g.roleCounts.Member=
   (g.roleCounts.Member||0)+1;

  tx.set(
   userRef,
   u
  );

  tx.set(
   gref,
   g
  );

  tx.set(
   mref,
   {
    uid,
    inGameName:
     u.character.inGameName,
    level:u.level||1,
    role:'Member',
    joinedAt:Timestamp.now()
   }
  );
 });

 return{
  ok:true
 };
});


/* =========================================================
   LEAVE GUILD
   ========================================================= */

exports.leaveGuild=onCall(async req=>{
 const uid=authUid(req);

 const {data:u}=
  await getUser(uid);

 if(!u.guildId){
  throw new HttpsError(
   'failed-precondition',
   'You are not in a guild.'
  );
 }

 const gid=u.guildId;

 const gref=
  db.doc(`guilds/${gid}`);

 const mref=
  gref.collection('members').doc(uid);

 const uref=
  db.doc(`users/${uid}`);

 await db.runTransaction(async tx=>{
  const [gs,ms,us]=
   await Promise.all([
    tx.get(gref),
    tx.get(mref),
    tx.get(uref)
   ]);

  if(!gs.exists||!ms.exists){
   throw new HttpsError(
    'not-found',
    'Guild membership not found.'
   );
  }

  if(
   ms.data().role==='Guild Leader'
  ){
   throw new HttpsError(
    'failed-precondition',
    'Guild Leader must transfer leadership or disband the guild before leaving.'
   );
  }

  const g=gs.data();

  const uu=ensureInv(
   us.data()
  );

  const oldRole=
   ms.data().role;

  g.memberCount=
   Math.max(
    0,
    (g.memberCount||1)-1
   );

  g.roleCounts=
   g.roleCounts||{};

  g.roleCounts[oldRole]=
   Math.max(
    0,
    (g.roleCounts[oldRole]||0)-1
   );

  uu.guildId=null;

  tx.set(
   gref,
   g
  );

  tx.set(
   uref,
   uu
  );

  tx.delete(
   mref
  );
 });

 return{
  ok:true
 };
});


/* =========================================================
   SET GUILD ROLE
   ========================================================= */

exports.setGuildRole=onCall(async req=>{
 const uid=authUid(req);

 const target=String(
  req.data.memberUid||''
 );

 const role=String(
  req.data.role||''
 );

 if(
  !ROLE_NAMES.includes(role) ||
  role==='Guild Leader'
 ){
  throw new HttpsError(
   'invalid-argument',
   'Invalid role.'
  );
 }

 const {data:u}=
  await getUser(uid);

 if(!u.guildId){
  throw new HttpsError(
   'failed-precondition',
   'Not in a guild.'
  );
 }

 const gref=
  db.doc(`guilds/${u.guildId}`);

 const meRef=
  gref.collection('members').doc(uid);

 const tarRef=
  gref.collection('members').doc(target);

 await db.runTransaction(async tx=>{
  const [gs,me,tar]=
   await Promise.all([
    tx.get(gref),
    tx.get(meRef),
    tx.get(tarRef)
   ]);

  if(
   !gs.exists ||
   !me.exists ||
   !tar.exists
  ){
   throw new HttpsError(
    'not-found',
    'Guild member not found.'
   );
  }

  if(
   ![
    'Guild Leader',
    'Vice Leader'
   ].includes(me.data().role)
  ){
   throw new HttpsError(
    'permission-denied',
    'You cannot manage guild roles.'
   );
  }

  if(
   tar.data().role===
   'Guild Leader'
  ){
   throw new HttpsError(
    'permission-denied',
    'Guild Leader role cannot be changed here.'
   );
  }

  const g=gs.data();

  const old=
   tar.data().role;

  g.roleCounts=
   g.roleCounts||{};

  if(old===role){
   return;
  }

  if(
   (g.roleCounts[role]||0)>=
   ROLE_LIMITS[role]
  ){
   throw new HttpsError(
    'resource-exhausted',
    `${role} role limit reached.`
   );
  }

  g.roleCounts[old]=
   Math.max(
    0,
    (g.roleCounts[old]||0)-1
   );

  g.roleCounts[role]=
   (g.roleCounts[role]||0)+1;

  tx.set(
   gref,
   g
  );

  tx.update(
   tarRef,
   {
    role
   }
  );
 });

 return{
  ok:true
 };
});


/* =========================================================
   TRANSFER GUILD LEADERSHIP
   ========================================================= */

exports.transferGuildLeadership=onCall(async req=>{
 const uid=authUid(req);

 const target=String(
  req.data.memberUid||''
 );

 const {data:u}=
  await getUser(uid);

 if(!u.guildId){
  throw new HttpsError(
   'failed-precondition',
   'Not in a guild.'
  );
 }

 const gref=
  db.doc(`guilds/${u.guildId}`);

 const meRef=
  gref.collection('members').doc(uid);

 const tarRef=
  gref.collection('members').doc(target);

 await db.runTransaction(async tx=>{
  const [gs,me,tar]=
   await Promise.all([
    tx.get(gref),
    tx.get(meRef),
    tx.get(tarRef)
   ]);

  if(
   !gs.exists ||
   !me.exists ||
   !tar.exists
  ){
   throw new HttpsError(
    'not-found',
    'Guild member not found.'
   );
  }

  if(
   me.data().role!=='Guild Leader' ||
   gs.data().leaderUid!==uid
  ){
   throw new HttpsError(
    'permission-denied',
    'Only the Guild Leader can transfer leadership.'
   );
  }

  if(target===uid){
   throw new HttpsError(
    'invalid-argument',
    'Choose another member.'
   );
  }

  const g=gs.data();

  g.leaderUid=target;
  g.leaderName=
   tar.data().inGameName;

  g.roleCounts=
   g.roleCounts||{};

  g.roleCounts['Guild Leader']=1;

  const oldTargetRole=
   tar.data().role;

  g.roleCounts[oldTargetRole]=
   Math.max(
    0,
    (g.roleCounts[oldTargetRole]||0)-1
   );

  if(
   (g.roleCounts['Member']||0)>=
   ROLE_LIMITS.Member
  ){
   throw new HttpsError(
    'resource-exhausted',
    'Member role capacity is full for the former leader.'
   );
  }

  g.roleCounts['Member']=
   (g.roleCounts['Member']||0)+1;

  tx.set(
   gref,
   g
  );

  tx.update(
   meRef,
   {
    role:'Member'
   }
  );

  tx.update(
   tarRef,
   {
    role:'Guild Leader'
   }
  );
 });

 return{
  ok:true
 };
});


/* =========================================================
   TOURNAMENT DASHBOARD
   ========================================================= */

exports.getTournamentDashboard=onCall(async req=>{
 const uid=authUid(req);

 const {data:u}=
  await getUser(uid);

 const q=
  await db
  .collection('tournamentMatches')
  .where('playerUid','==',uid)
  .orderBy('createdAt','desc')
  .limit(10)
  .get();

 return{
  stats:u.tournamentStats,

  matches:
   q.docs.map(
    d=>clean({
     id:d.id,
     ...d.data()
    })
   )
 };
});


/* =========================================================
   START TOURNAMENT
   ========================================================= */

exports.startTournament=onCall(async req=>{
 const uid=authUid(req);

 const userRef=
  db.doc(`users/${uid}`);

 const matchRef=
  db.collection(
   'tournamentMatches'
  ).doc();

 let match;

 await db.runTransaction(async tx=>{
  const us=
   await tx.get(userRef);

  const u=ensureInv(
   us.data()
  );

  if(
   (+u.inventory.items.tournament_scroll||0)<1
  ){
   throw new HttpsError(
    'failed-precondition',
    'A Tournament Scroll is required.'
   );
  }

  addItem(
   u,
   'items',
   'tournament_scroll',
   -1
  );

  const pool=
   await db
   .collection('users')
   .where('characterCreated','==',true)
   .limit(25)
   .get();

  const choices=
   pool.docs.filter(
    d=>d.id!==uid
   );

  const opp=
   choices.length
   ?choices[
     randInt(
      0,
      choices.length-1
     )
    ]
   :null;

  const od=
   opp
   ?ensureInv(opp.data())
   :u;

  const oc=
   od.character||{
    inGameName:'Arena Echo',
    classId:'warrior'
   };

  const pc=
   CLASSES[u.character.classId]||
   CLASSES.archer;

  const cc=
   CLASSES[oc.classId]||
   CLASSES.warrior;

  const php=
   pc.hp+
   (u.level||1)*4;

  const ohp=
   cc.hp+
   (od.level||1)*4;

  match={
   playerUid:uid,
   opponentUid:
    opp?opp.id:null,
   opponentType:'ai',
   opponentName:
    opp
    ?oc.inGameName
    :'Arena Echo',
   opponentClass:cc.name,
   playerClass:pc.name,
   playerHp:php,
   playerMaxHp:php,
   opponentHp:ohp,
   opponentMaxHp:ohp,
   turn:0,
   status:'active',
   result:null,
   createdAt:Timestamp.now()
  };

  tx.set(
   userRef,
   u
  );

  tx.set(
   matchRef,
   match
  );
 });

 return{
  match:{
   id:matchRef.id,
   ...clean(match)
  }
 };
});


/* =========================================================
   TOURNAMENT ACTION
   ========================================================= */

exports.tournamentAction=onCall(async req=>{
 const uid=authUid(req);

 const id=String(
  req.data.matchId||''
 );

 const action=String(
  req.data.action||''
 );

 const mref=
  db.doc(
   `tournamentMatches/${id}`
  );

 const uref=
  db.doc(`users/${uid}`);

 if(![
  'attack',
  'guard',
  'skill'
 ].includes(action)){
  throw new HttpsError(
   'invalid-argument',
   'Invalid action.'
  );
 }

 let out;
 let prof;

 await db.runTransaction(async tx=>{
  const [ms,us]=
   await Promise.all([
    tx.get(mref),
    tx.get(uref)
   ]);

  if(!ms.exists){
   throw new HttpsError(
    'not-found',
    'Match not found.'
   );
  }

  const m=ms.data();

  const u=ensureInv(
   us.data()
  );

  if(
   m.playerUid!==uid ||
   m.status!=='active'
  ){
   throw new HttpsError(
    'failed-precondition',
    'Match is not active.'
   );
  }

  const cls=
   CLASSES[u.character.classId]||
   CLASSES.archer;

  const base=
   cls.atk+
   (u.level||1)*1.2+
   (+u.upgrades.dmg||0)*2;

  let pdmg=
   Math.round(
    base*
    (
     action==='skill'
     ?1.7
     :action==='guard'
      ?.55
      :1
    )*
    (
     .85+
     Math.random()*.3
    )
   );

  let odmg=
   Math.round(
    (
     8+
     (m.opponentMaxHp/30)
    )*
    (
     .8+
     Math.random()*.4
    )
   );

  if(action==='guard'){
   odmg=Math.round(
    odmg*.45
   );
  }

  m.opponentHp=
   Math.max(
    0,
    m.opponentHp-pdmg
   );

  if(m.opponentHp>0){
   m.playerHp=
    Math.max(
     0,
     m.playerHp-odmg
    );
  }

  m.turn++;

  if(
   m.opponentHp<=0 ||
   m.playerHp<=0 ||
   m.turn>=30
  ){
   m.status='complete';
   m.completedAt=Timestamp.now();

   m.result=
    m.opponentHp<=0 &&
    m.playerHp>0
    ?'Win'
    :m.playerHp<=0 &&
     m.opponentHp>0
     ?'Loss'
     :'Tie';

   const st=
    u.tournamentStats;

   if(m.result==='Win'){
    st.wins++;
    u.currencies.gold+=100;
   }
   else if(m.result==='Loss'){
    st.losses++;
   }
   else{
    st.ties++;
   }

   st.rank=
    Math.max(
     1,
     1000-
     st.wins*10+
     st.losses*3
    );
  }

  tx.set(
   mref,
   m
  );

  tx.set(
   uref,
   u
  );

  out={
   id:mref.id,
   ...clean(m)
  };

  prof=
   profilePayload(
    u,
    uid
   );
 });

 return{
  match:out,
  profile:prof
 };
});


/* =========================================================
   DUNGEON DASHBOARD
   ========================================================= */

exports.getDungeonDashboard=onCall(async req=>{
 const uid=authUid(req);

 const {data:u}=
  await getUser(uid);

 return{
  progress:
   u.dungeonProgress
 };
});


function dungeonEnemy(
 floor,
 wave,
 boss
){
 const biome=
  BIOMES[
   Math.floor(
    (floor-1)/15
   )%
   BIOMES.length
  ];

 const milestone=
  floor%10===0;

 if(boss){
  return{
   name:
    (
     milestone
     ?'Empowered '
     :''
    )+
    biome+
    ' Floor Boss',

   hp:
    Math.round(
     90+
     floor*18
    )*
    (
     milestone
     ?2.2
     :1.2
    ),

   biome
  };
 }

 return{
  name:
   `${biome} Hostile ${wave}`,

  hp:
   Math.round(
    35+
    floor*7+
    wave*12
   ),

  biome
 };
}


/* =========================================================
   START DUNGEON
   ========================================================= */

exports.startDungeon=onCall(async req=>{
 const uid=authUid(req);

 const floor=
  Math.floor(
   +req.data.floor||0
  );

 if(
  floor<1 ||
  floor>100
 ){
  throw new HttpsError(
   'invalid-argument',
   'Floor must be 1-100.'
  );
 }

 const uref=
  db.doc(`users/${uid}`);

 const runRef=
  db.collection(
   'dungeonRuns'
  ).doc();

 let run;

 await db.runTransaction(async tx=>{
  const us=
   await tx.get(uref);

  const u=ensureInv(
   us.data()
  );

  const prog=
   u.dungeonProgress;

  const done=
   (
    prog.completedFloors||[]
   ).includes(floor);

  if(
   !done &&
   floor>
   Math.max(
    1,
    (prog.highestFloor||0)+1
   )
  ){
   throw new HttpsError(
    'failed-precondition',
    'That floor is not unlocked.'
   );
  }

  if(
   (+u.inventory.items.dungeon_scroll||0)<1
  ){
   throw new HttpsError(
    'failed-precondition',
    'A Dungeon Scroll is required.'
   );
  }

  addItem(
   u,
   'items',
   'dungeon_scroll',
   -1
  );

  const cls=
   CLASSES[u.character.classId]||
   CLASSES.archer;

  const hp=
   cls.hp+
   (u.level||1)*5+
   (+u.upgrades.hp||0)*10;

  const e=
   dungeonEnemy(
    floor,
    1,
    false
   );

  run={
   uid,
   floor,
   status:'active',
   stage:'wave',
   wave:1,
   heroHp:hp,
   heroMaxHp:hp,
   enemyName:e.name,
   enemyHp:e.hp,
   enemyMaxHp:e.hp,
   biome:e.biome,
   createdAt:Timestamp.now(),
   rewardGranted:false
  };

  tx.set(
   uref,
   u
  );

  tx.set(
   runRef,
   run
  );
 });

 return{
  run:{
   id:runRef.id,
   ...clean(run)
  }
 };
});


/* =========================================================
   DUNGEON ACTION
   ========================================================= */

exports.dungeonAction=onCall(async req=>{
 const uid=authUid(req);

 const id=String(
  req.data.runId||''
 );

 const action=String(
  req.data.action||''
 );

 const rref=
  db.doc(
   `dungeonRuns/${id}`
  );

 const uref=
  db.doc(`users/${uid}`);

 if(![
  'attack',
  'guard',
  'skill'
 ].includes(action)){
  throw new HttpsError(
   'invalid-argument',
   'Invalid action.'
  );
 }

 let run;
 let profile;
 let rewardGold=0;
 let bundleChest=false;

 await db.runTransaction(async tx=>{
  const [rs,us]=
   await Promise.all([
    tx.get(rref),
    tx.get(uref)
   ]);

  if(!rs.exists){
   throw new HttpsError(
    'not-found',
    'Dungeon run not found.'
   );
  }

  const r=rs.data();

  const u=ensureInv(
   us.data()
  );

  if(
   r.uid!==uid ||
   r.status!=='active'
  ){
   throw new HttpsError(
    'failed-precondition',
    'Dungeon run is not active.'
   );
  }

  const cls=
   CLASSES[u.character.classId]||
   CLASSES.archer;

  const base=
   cls.atk+
   (u.level||1)*1.1+
   (+u.upgrades.dmg||0)*2;

  let pdmg=
   Math.round(
    base*
    (
     action==='skill'
     ?1.65
     :action==='guard'
      ?.55
      :1
    )*
    (
     .85+
     Math.random()*.3
    )
   );

  let edmg=
   Math.round(
    (
     6+
     r.floor*.45+
     (
      r.stage==='boss'
      ?8
      :0
     )
    )*
    (
     .8+
     Math.random()*.4
    )
   );

  if(action==='guard'){
   edmg=
    Math.round(
     edmg*.45
    );
  }

  r.enemyHp=
   Math.max(
    0,
    r.enemyHp-pdmg
   );

  if(r.enemyHp>0){
   r.heroHp=
    Math.max(
     0,
     r.heroHp-edmg
    );
  }

  if(r.heroHp<=0){
   r.status='failed';
   r.completedAt=Timestamp.now();
  }
  else if(r.enemyHp<=0){

   if(
    r.stage==='wave' &&
    r.wave<2
   ){
    r.wave++;

    const e=
     dungeonEnemy(
      r.floor,
      r.wave,
      false
     );

    r.enemyName=e.name;
    r.enemyHp=
     r.enemyMaxHp=e.hp;
   }
   else if(
    r.stage==='wave'
   ){
    r.stage='boss';

    const e=
     dungeonEnemy(
      r.floor,
      0,
      true
     );

    r.enemyName=e.name;
    r.enemyHp=
     r.enemyMaxHp=e.hp;
   }
   else{
    r.status='complete';
    r.completedAt=Timestamp.now();

    rewardGold=
     150+
     r.floor*25;

    u.currencies.gold+=
     rewardGold;

    const done=
     new Set(
      u.dungeonProgress
      .completedFloors||[]
     );

    done.add(
     r.floor
    );

    u.dungeonProgress
     .completedFloors=
      [...done].sort(
       (a,b)=>a-b
      );

    u.dungeonProgress
     .highestFloor=
      Math.max(
       u.dungeonProgress
        .highestFloor||0,
       r.floor
      );

    if(r.floor%10===0){
     addItem(
      u,
      'bundleChest',
      'bundle_chest',
      1
     );

     bundleChest=true;
    }

    r.rewardGranted=true;
   }
  }

  tx.set(
   rref,
   r
  );

  tx.set(
   uref,
   u
  );

  run={
   id:rref.id,
   ...clean(r)
  };

  profile=
   profilePayload(
    u,
    uid
   );
 });

 return{
  run,
  profile,
  rewardGold,
  bundleChest
 };
});


/* =========================================================
   LEADERBOARDS
   ========================================================= */

exports.getLeaderboards=onCall(async req=>{
 authUid(req);

 async function mapUsers(
  q,
  kind
 ){
  const s=await q.get();

  return s.docs.map(d=>{
   const u=
    ensureInv(
     d.data()
    );

   const c=
    u.character||{};

   const base={
    name:
     c.inGameName||
     'Unknown',

    className:
     (
      CLASSES[c.classId]||
      {}
     ).name||
     'Unknown'
   };

   if(kind==='players'){
    return{
     ...base,
     level:u.level||1
    };
   }

   if(kind==='richest'){
    return{
     ...base,
     gold:u.currencies.gold||0
    };
   }

   if(kind==='tournament'){
    return{
     ...base,
     ...u.tournamentStats
    };
   }

   return{
    ...base,
    highestFloor:
     u.dungeonProgress
      .highestFloor||0
   };
  });
 }

 const [
  players,
  richest,
  tournament,
  dungeon,
  gs
 ]=
 await Promise.all([

  mapUsers(
   db.collection('users')
   .where(
    'characterCreated',
    '==',
    true
   )
   .orderBy(
    'level',
    'desc'
   )
   .limit(10),
   'players'
  ),

  mapUsers(
   db.collection('users')
   .where(
    'characterCreated',
    '==',
    true
   )
   .orderBy(
    'currencies.gold',
    'desc'
   )
   .limit(10),
   'richest'
  ),

  mapUsers(
   db.collection('users')
   .where(
    'characterCreated',
    '==',
    true
   )
   .orderBy(
    'tournamentStats.wins',
    'desc'
   )
   .limit(10),
   'tournament'
  ),

  mapUsers(
   db.collection('users')
   .where(
    'characterCreated',
    '==',
    true
   )
   .orderBy(
    'dungeonProgress.highestFloor',
    'desc'
   )
   .limit(10),
   'dungeon'
  ),

  db.collection('guilds')
  .orderBy(
   'level',
   'desc'
  )
  .limit(10)
  .get()

 ]);

 return{
  players,
  richest,
  tournament,
  dungeon,

  guilds:
   gs.docs.map(d=>{
    const g=d.data();

    return{
     guildName:g.name,
     sign:g.sign,
     level:g.level||1,
     memberCount:
      g.memberCount||0
    };
   })
 };
});


/* =========================================================
   EDIT PROFILE
   ========================================================= */

exports.updateProfile=onCall(async req=>{
 const uid=authUid(req);

 const firstName=
  String(
   req.data.firstName||''
  ).trim();

 const lastName=
  String(
   req.data.lastName||''
  ).trim();

 const birthdate=
  String(
   req.data.birthdate||''
  );

 const classId=
  String(
   req.data.classId||''
  );

 const gender=
  String(
   req.data.gender||''
  );

 const inGameName=
  String(
   req.data.inGameName||''
  ).trim();

 if(
  !titleNameOk(firstName) ||
  !titleNameOk(lastName) ||
  !/^\d{4}-\d{2}-\d{2}$/.test(birthdate) ||
  !CLASS_IDS.includes(classId) ||
  !GENDERS.includes(gender) ||
  !nameOk(inGameName)
 ){
  throw new HttpsError(
   'invalid-argument',
   'One or more profile fields are invalid.'
  );
 }

 const uref=
  db.doc(`users/${uid}`);

 let out;

 await db.runTransaction(async tx=>{
  const us=
   await tx.get(uref);

  if(!us.exists){
   throw new HttpsError(
    'not-found',
    'Player not found.'
   );
  }

  const u=ensureInv(
   us.data()
  );

  const oldNorm=
   u.character.normalizedName;

  const newNorm=
   norm(inGameName);

  const newRef=
   db.doc(
    `playerNames/${newNorm}`
   );

  const oldRef=
   db.doc(
    `playerNames/${oldNorm}`
   );

  if(newNorm!==oldNorm){
   const ns=
    await tx.get(newRef);

   if(
    ns.exists &&
    ns.data().uid!==uid
   ){
    throw new HttpsError(
     'already-exists',
     'That in-game name is already taken.'
    );
   }

   tx.set(
    newRef,
    {
     uid,
     displayName:inGameName,
     normalizedName:newNorm,
     createdAt:Timestamp.now()
    }
   );

   tx.delete(
    oldRef
   );
  }

  const oldClass=
   u.character.classId;

  u.firstName=firstName;
  u.lastName=lastName;
  u.birthdate=birthdate;

  u.character.inGameName=
   inGameName;

  u.character.normalizedName=
   newNorm;

  u.character.gender=
   gender;

  u.character.classId=
   classId;

  if(classId!==oldClass){
   const wid=
    u.equipment.weaponId;

   if(
    wid &&
    CATALOG[wid] &&
    CATALOG[wid].cls!==classId
   ){
    u.equipment.weaponId=null;
   }

   const starter=
    `w_${classId}_0`;

   addItem(
    u,
    'weapons',
    starter,
    1
   );

   u.equipment.weaponId=
    starter;
  }

  tx.set(
   uref,
   u
  );

  out=profilePayload(
   u,
   uid
  );
 });

 return{
  profile:out
 };
});


/* =========================================================
   ADMIN COMMAND HELPERS
   ========================================================= */

function parseCommand(s){
 const a=[];

 String(s||'').replace(
  /"([^"]*)"|'([^']*)'|(\S+)/g,
  (_,d,q,w)=>{
   a.push(
    d??q??w
   );

   return'';
  }
 );

 return a;
}


async function findUidByName(name){
 const s=
  await db
  .doc(
   `playerNames/${norm(name)}`
  )
  .get();

 return s.exists
  ?s.data().uid
  :null;
}


async function audit(
 adminUid,
 command,
 args,
 target,
 success,
 outcome
){
 await db
 .collection('adminAuditLogs')
 .add({
  adminUid,
  command,
  args,
  target,
  success,

  outcome:
   String(outcome||'')
   .slice(0,500),

  requestId:
   `${Date.now()}_${Math.random().toString(36).slice(2,10)}`,

  timestamp:
   Timestamp.now()
 });
}


async function mutateOne(
 uid,
 fn
){
 const ref=
  db.doc(`users/${uid}`);

 await db.runTransaction(async tx=>{
  const s=
   await tx.get(ref);

  if(!s.exists){
   throw new HttpsError(
    'not-found',
    'Target player not found.'
   );
  }

  const u=
   ensureInv(
    s.data()
   );

  fn(u);

  tx.set(
   ref,
   u
  );
 });
}


async function mutateAll(fn){
 let last=null;
 let total=0;

 while(true){
  let q=
   db.collection('users')
   .orderBy('__name__')
   .limit(300);

  if(last){
   q=q.startAfter(last);
  }

  const s=
   await q.get();

  if(s.empty){
   break;
  }

  const batch=
   db.batch();

  for(const d of s.docs){
   const u=
    ensureInv(
     d.data()
    );

   fn(u);

   batch.set(
    d.ref,
    u
   );

   total++;
  }

  await batch.commit();

  last=
   s.docs[
    s.docs.length-1
   ];

  if(s.size<300){
   break;
  }
 }

 return total;
}


/* =========================================================
   ADMIN COMMANDS
   ========================================================= */

exports.adminCommand=onCall(async req=>{
 const uid=authUid(req);

 if(!req.auth.token.admin){
  throw new HttpsError(
   'permission-denied',
   'Administrator permission required.'
  );
 }

 const p=
  parseCommand(
   req.data.command
  );

 const cmd=
  (
   p.shift()||''
  )
  .replace(/^\//,'')
  .toLowerCase();

 if(cmd==='help'){
  return{
   message:
`/gold <player/all> <amount>
/gems <player/all> <amount>
/level <player> <level>
/xp <player/all> <amount>
/item <player> <itemId> <quantity>
/announce <message>
/help`
  };
 }

 let target=p[0];
 let success=false;
 let msg='';

 try{

  if([
   'gold',
   'gems',
   'xp'
  ].includes(cmd)){

   const amt=
    Number(p[1]);

   if(
    !Number.isSafeInteger(amt) ||
    amt<0 ||
    amt>1000000
   ){
    throw new HttpsError(
     'invalid-argument',
     'Amount must be 0-1,000,000.'
    );
   }

   const apply=u=>{
    if(cmd==='gold'){
     u.currencies.gold=
      Math.min(
       Number.MAX_SAFE_INTEGER,
       u.currencies.gold+amt
      );
    }
    else if(cmd==='gems'){
     u.currencies.gems=
      Math.min(
       Number.MAX_SAFE_INTEGER,
       u.currencies.gems+amt
      );
    }
    else{
     u.experience=
      Math.min(
       Number.MAX_SAFE_INTEGER,
       (u.experience||0)+amt
      );
    }
   };

   if(target==='all'){
    const n=
     await mutateAll(apply);

    msg=
     `Updated ${n} players.`;
   }
   else{
    const tu=
     await findUidByName(
      target
     );

    if(!tu){
     throw new HttpsError(
      'not-found',
      'Player not found.'
     );
    }

    await mutateOne(
     tu,
     apply
    );

    msg='Player updated.';
   }
  }

  else if(cmd==='level'){
   const lv=
    Number(p[1]);

   if(
    !Number.isInteger(lv) ||
    lv<1 ||
    lv>999
   ){
    throw new HttpsError(
     'invalid-argument',
     'Level must be 1-999.'
    );
   }

   const tu=
    await findUidByName(
     target
    );

   if(!tu){
    throw new HttpsError(
     'not-found',
     'Player not found.'
    );
   }

   await mutateOne(
    tu,
    u=>u.level=lv
   );

   msg='Level updated.';
  }

  else if(cmd==='item'){
   const id=p[1];
   const qty=Number(p[2]);
   const it=CATALOG[id];

   if(
    !it ||
    !Number.isInteger(qty) ||
    qty<1 ||
    qty>999
   ){
    throw new HttpsError(
     'invalid-argument',
     'Invalid item or quantity.'
    );
   }

   const tu=
    await findUidByName(
     target
    );

   if(!tu){
    throw new HttpsError(
     'not-found',
     'Player not found.'
    );
   }

   await mutateOne(
    tu,
    u=>addItem(
     u,
     it.cat,
     id,
     qty
    )
   );

   msg='Item granted.';
  }

  else if(cmd==='announce'){
   const text=
    p.join(' ').trim();

   if(
    !text ||
    text.length>300
   ){
    throw new HttpsError(
     'invalid-argument',
     'Announcement must be 1-300 characters.'
    );
   }

   await db
   .doc(
    'worldAnnouncements/current'
   )
   .set({
    message:text,
    createdBy:uid,
    createdAt:Timestamp.now()
   });

   target='all';

   msg=
    'Announcement published.';
  }

  else{
   throw new HttpsError(
    'invalid-argument',
    'Unknown command. Use /help.'
   );
  }

  success=true;

  await audit(
   uid,
   cmd,
   p,
   target,
   true,
   msg
  );

  return{
   message:msg
  };
 }
 catch(e){

  await audit(
   uid,
   cmd,
   p,
   target,
   false,
   e.message
  ).catch(()=>{});

  throw e;
 }
});

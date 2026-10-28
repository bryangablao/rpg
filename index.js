const {onCall,HttpsError}=require('firebase-functions/v2/https');
const admin=require('firebase-admin');
admin.initializeApp();
const db=admin.firestore(),FV=admin.firestore.FieldValue;
const CLASSES=require('./classes.json');
/* Central starting configuration (edit here, never on the client) */
const START={gold:0,gems:0};
const GENDERS=['m','f'];
const fail=(c,m)=>{throw new HttpsError(c,m)};

/* Public callable: creates the Auth user AND reserves the username atomically.
   Password is passed straight to the Admin SDK over TLS and never stored by us. */
exports.registerAccount=onCall({enforceAppCheck:false /* set true once App Check is configured */},async req=>{
  const d=req.data||{};
  const email=String(d.email||'').trim().toLowerCase(),password=String(d.password||''),username=String(d.username||'').trim().toLowerCase();
  const name=String(d.characterName||''),classId=String(d.classId||''),gender=String(d.gender||'');
  if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254)fail('invalid-argument','Invalid email.');
  if(password.length<8||password.length>128)fail('invalid-argument','Password must be 8-128 characters.');
  if(!/^[a-z0-9_]{3,16}$/.test(username))fail('invalid-argument','Username must be 3-16 letters, digits or _.');
  if(!/^[A-Za-z]{3,8}$/.test(name))fail('invalid-argument','Invalid character name.');
  if(!CLASSES.includes(classId)||!GENDERS.includes(gender))fail('invalid-argument','Invalid character.');
  const nameRef=db.doc('usernames/'+username);
  try{await nameRef.create({reservedAt:FV.serverTimestamp(),uid:null})}
  catch(e){fail('already-exists','That username is taken.')}
  let user;
  try{user=await admin.auth().createUser({email,password,displayName:username})}
  catch(e){await nameRef.delete();fail(e.code==='auth/email-already-exists'?'already-exists':'invalid-argument',e.code==='auth/email-already-exists'?'That email is already registered.':'Could not create account.')}
  const uid=user.uid,chId='c1',ref=db.doc('users/'+uid);
  await db.runTransaction(async t=>{
    if((await t.get(ref)).exists)return; /* starter rewards are granted exactly once */
    t.set(nameRef,{uid,reservedAt:FV.serverTimestamp()});
    t.set(ref,{uid,username,displayName:name,accountRole:'player',createdAt:FV.serverTimestamp(),lastLoginAt:FV.serverTimestamp(),selectedCharacterId:chId,guildId:null,homeId:null,gold:START.gold,gems:START.gems});
    t.set(ref.collection('characters').doc(chId),{name,classId,gender,level:1,xp:0,stats:{},equipment:{weapon:'starter_weapon',head:null,chest:'starter_armor',legs:null,feet:null,necklace:null,ring:null,bracelet:null},questProgress:{},createdAt:FV.serverTimestamp()});
    t.set(ref.collection('inventory').doc('starter_weapon'),{catalogItemId:`w_${classId}_0`,category:'weapons',quantity:1,metadata:{},createdAt:FV.serverTimestamp()});
    t.set(ref.collection('inventory').doc('starter_armor'),{catalogItemId:'a_0',category:'armors',quantity:1,metadata:{},createdAt:FV.serverTimestamp()});
  });
  return {ok:true};
});

exports.touchLogin=onCall(async req=>{
  if(!req.auth)fail('unauthenticated','Sign in first.');
  const ref=db.doc('users/'+req.auth.uid);
  if(!(await ref.get()).exists)fail('not-found','Profile missing.');
  await ref.update({lastLoginAt:FV.serverTimestamp()});
  return {ok:true};
});

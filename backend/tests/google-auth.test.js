import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {OAuth2Client} from 'google-auth-library';
import {verifyGoogleCredential} from '../src/services/google-auth.service.js';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const client=new OAuth2Client();
// Exercise the real library verifier with locally generated test keys; never Google's live keys.
client.getFederatedSignonCertsAsync=async()=>({certs:{fixture:publicKey.export({type:'spki',format:'pem'})}});
const clientId='test.apps.googleusercontent.com',nonce='a'.repeat(64);
function token(overrides={}){return jwt.sign({sub:'123456',email:'invited@gmail.com',email_verified:true,nonce,...overrides},privateKey,{algorithm:'RS256',keyid:'fixture',issuer:overrides.iss||'https://accounts.google.com',audience:overrides.aud||clientId,expiresIn:'1h'});}
// Set the claims directly when testing issuer/audience to avoid duplicate JWT options.
function rawToken(overrides={}){const now=Math.floor(Date.now()/1000);return jwt.sign({sub:'123456',email:'invited@gmail.com',email_verified:true,nonce,iss:'https://accounts.google.com',aud:clientId,iat:now,exp:now+3600,...overrides},privateKey,{algorithm:'RS256',keyid:'fixture'});}
test('Google verifier accepts a correctly signed fixture for the expected audience and nonce',async()=>{
 const payload=await verifyGoogleCredential(token(),nonce,{clientId,client});assert.equal(payload.sub,'123456');
});
for(const [name,changes] of [['audience',{aud:'attacker.apps.googleusercontent.com'}],['issuer',{iss:'https://attacker.example'}],['expiry',{iat:1,exp:2}],['email verification',{email_verified:false}],['nonce',{nonce:'other'}]])test('Google verifier rejects wrong '+name,async()=>{
 await assert.rejects(verifyGoogleCredential(rawToken(changes),nonce,{clientId,client}),e=>e.status===401);
});
test('Google verifier rejects a tampered signature',async()=>{
 const parts=token().split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
 await assert.rejects(verifyGoogleCredential(parts.join('.'),nonce,{clientId,client}),e=>e.status===401);
});
test('Google verifier is unavailable without the configured client ID',async()=>{
 await assert.rejects(verifyGoogleCredential(token(),nonce,{clientId:'',client}),e=>e.status===503);
});

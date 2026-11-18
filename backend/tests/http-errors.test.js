import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {errors} from '../src/middlewares/error.js';
import {HttpError} from '../src/utils/errors.js';
function response(error){const result={};const res={status(s){result.status=s;return this;},json(body){result.body=body;return this;}};errors(error,{},res,()=>{});return result;}
test('validation includes field details and HTTP 400',()=>{const parsed=z.object({name:z.string()}).safeParse({name:3});const r=response(parsed.error);assert.equal(r.status,400);assert.equal(r.body.details[0].field,'name');});
test('known HTTP errors preserve their status, unsupported uploads and malformed JSON are client errors',()=>{
 for(const status of [401,403,404,408,409,413,415,422,429,500,502,503,504])assert.equal(response(new HttpError(status,'Mensaje público')).body.status,status);
 assert.equal(response({type:'entity.parse.failed'}).status,400);assert.equal(response({code:'LIMIT_FILE_SIZE'}).status,413);assert.equal(response({code:'ER_DUP_ENTRY'}).status,409);
});
test('unexpected failures hide internal details',()=>{const saved=console.error;console.error=()=>{};try{const r=response(new Error('private database data'));assert.equal(r.status,500);assert.ok(!JSON.stringify(r.body).includes('private database data'));assert.equal(response({code:'ECONNREFUSED'}).status,503);}finally{console.error=saved;}});

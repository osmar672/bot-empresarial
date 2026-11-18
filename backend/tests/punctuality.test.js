import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateStreak,expectedShift} from '../src/services/punctuality.service.js';
const days=Array.from({length:7},(_,i)=>({day_of_week:i+1,state:i<5?'laboral':'descanso',start_time:'08:00:00',end_time:'17:00:00',updated_at:new Date('2026-01-01T00:00:00Z')}));
const mark=(day,time='13:59:00')=>({checked_in_at:new Date(day+'T'+time+'Z')});
test('consecutive scheduled arrivals, late arrival, absence, days off and upcoming shift',()=>{
 let result=calculateStreak({days,entries:[mark('2026-11-16'),mark('2026-11-17')],now:new Date('2026-11-18T13:00:00Z')});assert.equal(result.current,2);assert.equal(result.best,2);
 result=calculateStreak({days,entries:[mark('2026-11-16'),mark('2026-11-17','14:01:00')],now:new Date('2026-11-17T16:00:00Z')});assert.equal(result.current,0);assert.equal(result.best,1);
 result=calculateStreak({days,entries:[mark('2026-11-13'),mark('2026-11-16')],now:new Date('2026-11-16T16:00:00Z')});assert.equal(result.current,2);
 result=calculateStreak({days,entries:[mark('2026-11-16'),mark('2026-11-18')],now:new Date('2026-11-18T16:00:00Z')});assert.equal(result.current,1);
 result=calculateStreak({days,entries:[mark('2026-11-16'),mark('2026-11-18')],vacations:[{start_date:'2026-11-17',end_date:'2026-11-17'}],now:new Date('2026-11-18T16:00:00Z')});assert.equal(result.current,2);
});
test('no schedule means no invented streak; future schedule changes do not grade past arrivals',()=>{
 assert.equal(calculateStreak({days:[],entries:[mark('2026-11-16')],now:new Date('2026-11-16T16:00:00Z')}).configured,false);
 assert.equal(calculateStreak({days:days.map(d=>({...d,updated_at:new Date('2026-11-18T00:00:00Z')})),entries:[mark('2026-11-16')],now:new Date('2026-11-16T16:00:00Z')}).onTimeDays,0);
 const entry={...mark('2026-11-16'),expected_at:new Date('2026-11-16T14:00:00Z'),is_punctual:1};
 assert.equal(calculateStreak({days:[],entries:[entry],now:new Date('2026-11-16T16:00:00Z')}).current,1);
});
test('overnight shifts belong to their starting workday; first arrival defines punctuality',()=>{
 const shifts=[{day_of_week:5,start_time:'22:00:00',end_time:'05:00:00',state:'laboral'}];
 assert.equal(expectedShift(shifts,new Date('2026-11-14T09:00:00Z')).toISOString(),'2026-11-14T04:00:00.000Z');
 const result=calculateStreak({days,entries:[mark('2026-11-16','13:59:00'),mark('2026-11-16','16:00:00')],now:new Date('2026-11-16T17:00:00Z')});assert.equal(result.current,1);
});

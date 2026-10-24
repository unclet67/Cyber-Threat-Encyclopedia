// Reservation counts are enforced in the INSERT statement in research.mjs, not by a racy preflight check.
const limit=(value,max)=>value===undefined?max:/^\d+$/.test(String(value))?Math.min(Number(value),max):0;
export function researchLimits(env={}) {
 return {userDailyLimit:limit(env.RESEARCH_USER_DAILY_RUNS,4),globalDailyLimit:limit(env.RESEARCH_GLOBAL_DAILY_RUNS,12),monthlyLimit:limit(env.RESEARCH_MONTHLY_RUNS,40),maxOutputTokens:4000,maxToolCalls:4};
}
export function researchPeriods(now=Date.now()) {
 const d=new Date(now);return {day:Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()),month:Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)};
}
export async function researchBudget(db,user,env) {
 const limits=researchLimits(env),p=researchPeriods();
 const row=await db.prepare(`SELECT SUM(CASE WHEN user_id = ? AND created_at >= ? THEN 1 ELSE 0 END) user_day,
 SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) global_day, COUNT(*) month_total FROM research_jobs WHERE created_at >= ?`).bind(user,p.day,p.day,p.month).first();
 return {...limits,userDailyUsed:row?.user_day||0,globalDailyUsed:row?.global_day||0,monthlyUsed:row?.month_total||0,resetTimezone:'UTC',failedAttemptsCount:true};
}

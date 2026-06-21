// Builds the day-by-day DATA for the health plan and splices it into the
// __DATA__ placeholder in health-plan.html. Re-runnable.
const fs = require("fs");

const START = new Date(Date.UTC(2026, 5, 22)); // Mon 22 Jun 2026
const END   = new Date(Date.UTC(2026, 11, 31)); // Thu 31 Dec 2026
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const iso = d => d.toISOString().slice(0,10);
const pad = n => String(n).padStart(3,"0");

function phaseForWeek(w){
  if (w<=2)  return [0,"Foundation"];
  if (w<=6)  return [1,"Build the Base"];
  if (w<=14) return [2,"Strength & Rhythm"];
  if (w<=22) return [3,"Momentum"];
  return [4,"Strong Finish"];
}

const MOVE = {
 0:{
  Mon:["Full-body bodyweight starter — 3 rounds","Strength",15,"10 squats · 8 incline push-ups · 8 lunges/leg · 20s plank. Rest as needed."],
  Tue:["Brisk walk — 15 min","Cardio",15,"Pace where you can talk but not sing."],
  Wed:["Dumbbell full-body — 3 rounds","Strength",15,"10 goblet squats · 10 DB rows/side · 10 floor press · 20s plank."],
  Thu:["Brisk walk — 15 min","Cardio",15,""],
  Fri:["Bodyweight circuit — 3 rounds","Strength",15,"12 squats · 8 push-ups · 10 glute bridges · 20s plank."],
  Sat:["Longer walk + full-body stretch — 30 min","Cardio",30,""],
  Sun:["Rest + gentle stretch","Recovery",10,""],
 },
 1:{
  Mon:["Dumbbell Strength A (lower + push)","Strength",18,"3×8–12: goblet squat · DB floor press · DB Romanian deadlift · push-ups."],
  Tue:["Brisk walk + mobility — 20 min","Cardio",20,""],
  Wed:["Dumbbell Strength B (pull + core)","Strength",18,"3×8–12: DB row · DB shoulder press · glute bridge · plank."],
  Thu:["Brisk walk — 20 min","Cardio",20,""],
  Fri:["Bodyweight strength — 3 rounds","Strength",18,"Squats · push-ups · reverse lunges · hollow hold."],
  Sat:["Long walk / hike — 40 min","Cardio",40,""],
  Sun:["Mobility flow + rest","Recovery",12,""],
 },
 2:{
  Mon:["Dumbbell Strength A — progress","Strength",20,"Add 1 rep or heavier DBs vs last week. Squat · floor press · RDL · push-up."],
  Tue:["Zone-2 walk/jog — 25 min","Cardio",25,"Easy, steady, nose-breathing pace."],
  Wed:["Dumbbell Strength B — progress","Strength",20,"Row · shoulder press · split squat · plank. Beat last week."],
  Thu:["Walk + core — 20 min","Cardio",20,"15-min walk, then 2 rounds: plank · side plank · dead bug."],
  Fri:["Dumbbell Strength C (full body)","Strength",20,"3×10: goblet squat · row · floor press · hip hinge."],
  Sat:["Long active session — 45 min","Cardio",45,"Walk, hike, bike, or sport. Keep it fun."],
  Sun:["Mobility + reflect","Recovery",12,""],
 },
 3:{
  Mon:["Strength A — push intensity","Strength",20,"Heavier or slower reps. Keep form crisp."],
  Tue:["Intervals — 6×(1 min fast / 1 min easy)","Cardio",22,"Walk-jog or jog-run. Warm up + cool down."],
  Wed:["Strength B — push intensity","Strength",20,""],
  Thu:["Brisk walk — 25 min","Cardio",25,""],
  Fri:["Strength C — full body","Strength",20,""],
  Sat:["Long session + mobility — 45 min","Cardio",45,""],
  Sun:["Recovery walk + stretch","Recovery",15,""],
 },
 4:{
  Mon:["Strength A — keep the streak","Strength",18,""],
  Tue:["Brisk walk — 20 min","Cardio",20,""],
  Wed:["Strength B — keep the streak","Strength",18,""],
  Thu:["Walk + core — 20 min","Cardio",20,""],
  Fri:["Quick full-body circuit — 15 min","Strength",15,"Holiday-proof: squats · push-ups · rows · plank. Just move."],
  Sat:["Long walk — 40 min","Cardio",40,""],
  Sun:["Recovery + reflect on the year","Recovery",15,""],
 },
};

const NUTRITION = {
 0:"Swap sugary drinks for water · eat 1 fruit or veg",
 1:"Protein at every meal (palm-sized portion)",
 2:"Protein + 2 servings of veg today",
 3:"Whole foods 80/20 · mind your portions",
 4:"Hold the line — protein first, enjoy in moderation",
};
const sleepText = p => p===0 ? "Set a fixed bedtime + lights-out alarm" : "Same bedtime · 30-min screen-free wind-down";
const HYDRATE = "Drink ~2.5–3 L water (sip through the day)";

const MILESTONE = {
 0:"Foundations begin — three anchors plus water: a 15-min move, hydrate, nutrition swap, fixed bedtime. Keep it stupid-simple.",
 1:"Build the Base — structured dumbbell A/B strength starts. Nutrition steps up to protein at every meal.",
 2:"Strength & Rhythm — add a 3rd lift and progressive overload (+reps or weight weekly). Veg target rises.",
 3:"Momentum — turn up intensity with intervals and heavier lifts. The habit is built; now build capacity.",
 4:"Strong Finish — holiday-proof maintenance. Protect the streak, manage stress, finish the year strong.",
};

const SLOGANS = [
 "Small reps, lasting health.","Consistency beats intensity.","Show up, even at 15 minutes.",
 "Your future self is watching.","Motion creates emotion.","Tiny habits, big changes.",
 "Discipline outlasts motivation.","Progress over perfection.","Never miss twice.",
 "Sleep, move, eat, repeat.","A little today beats a lot someday.","Strong is built daily.",
 "Hydrate like it's your job.","Rest is part of the work.","Eat the rainbow, drink the water.",
 "Win the morning, win the day.","Energy follows movement.","The streak is the strategy.",
 "Showing up is the skill.","Health compounds quietly.","Be 1% better today.",
 "Move first, feel better after.","Calm body, clear mind.","You don't need perfect, you need going.",
];

const days = [];
const seenPhase = new Set();
let idx = 0;
for (let d = new Date(START); d <= END; d.setUTCDate(d.getUTCDate()+1)) {
  idx++;
  const n = pad(idx);
  const dow = DOW[d.getUTCDay()];
  const week = Math.floor((d - START) / 86400000 / 7) + 1;
  const [pidx, pname] = phaseForWeek(week);
  const tasks = [];

  if (!seenPhase.has(pidx)) {
    seenPhase.add(pidx);
    tasks.push({id:`ph-${pidx}`, kind:"review", diff:"Review", cat:"New Phase", title:MILESTONE[pidx]});
  }

  const [title, badge, mins, hint] = MOVE[pidx][dow];
  const mt = {id:`m-${n}`, kind:"move", diff:badge, cat:"Movement", title};
  if (hint) mt.hint = hint;
  tasks.push(mt);

  tasks.push({id:`h-${n}`, kind:"habit", diff:"Hydrate",   cat:"Hydration", title:HYDRATE});
  tasks.push({id:`n-${n}`, kind:"habit", diff:"Nutrition", cat:"Nutrition", title:NUTRITION[pidx]});
  tasks.push({id:`s-${n}`, kind:"habit", diff:"Sleep",     cat:"Sleep",     title:sleepText(pidx)});

  const mindDays = new Set(["Tue","Sat"]);
  if (pidx===4){ mindDays.add("Thu"); mindDays.add("Sun"); }
  if (mindDays.has(dow))
    tasks.push({id:`mn-${n}`, kind:"mind", diff:"Mind", cat:"Mental", title:"5-min breathing / mindfulness"});

  if (dow==="Sun") {
    const next = new Date(d); next.setUTCDate(next.getUTCDate()+1);
    const rtitle = (next > END)
      ? "Year-end review — look how far you've come. Set your next chapter."
      : "Weekly check-in: note energy & sleep, plan next week, celebrate a win.";
    tasks.push({id:`rf-${n}`, kind:"review", diff:"Review", cat:"Reflection", title:rtitle});
  }

  const wsDate = new Date(START); wsDate.setUTCDate(wsDate.getUTCDate()+7*(week-1));
  days.push({
    id:`d${iso(d)}`, date:iso(d), dow,
    full:`${MON[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2,"0")}, ${d.getUTCFullYear()}`,
    tasks, slogan:SLOGANS[(idx-1) % SLOGANS.length], phase:pname, est:mins,
    week_start:iso(wsDate), week,
  });
}

const totalTasks = days.reduce((s,x)=>s+x.tasks.length,0);
const totalWeeks = days[days.length-1].week;
const DATA = {meta:{start:iso(START), end:iso(END), total_tasks:totalTasks, total_days:days.length, total_weeks:totalWeeks}, days};

const file = "health-plan.html";
let html = fs.readFileSync(file, "utf8");
html = html.replace("__DATA__", JSON.stringify(DATA));
fs.writeFileSync(file, html, "utf8");

console.log("Spliced DATA into", file);
console.log("total_days:", days.length, "| total_weeks:", totalWeeks, "| total_tasks:", totalTasks);

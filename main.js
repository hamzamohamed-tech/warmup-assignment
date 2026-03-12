const fs = require("fs");

// ================= Helper Functions =================

function convert12ToSeconds(timeStr) {
    let [time, period] = timeStr.trim().split(" ");
    let [h, m, s] = time.split(":").map(Number);

    if (period.toLowerCase() === "pm" && h !== 12) h += 12;
    if (period.toLowerCase() === "am" && h === 12) h = 0;

    return h * 3600 + m * 60 + s;
}

function timeToSeconds(t) {
    let [h, m, s] = t.split(":").map(Number);
    return h * 3600 + m * 60 + s;
}

function secondsToTime(sec) {
    let h = Math.floor(sec / 3600);
    sec %= 3600;
    let m = Math.floor(sec / 60);
    let s = sec % 60;

    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function getMonth(dateStr) {
    return parseInt(dateStr.split("-")[1]);
}

function getDayName(dateStr) {
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    let d = new Date(dateStr);
    return days[d.getDay()];
}

// ============================================================
// Function 1
// ============================================================

function getShiftDuration(startTime, endTime) {

    let start = convert12ToSeconds(startTime);
    let end = convert12ToSeconds(endTime);

    if (end < start) end += 24 * 3600;

    return secondsToTime(end - start);
}

// ============================================================
// Function 2
// ============================================================

function getIdleTime(startTime, endTime) {

    let start = convert12ToSeconds(startTime);
    let end = convert12ToSeconds(endTime);

    if (end < start) end += 24 * 3600;

    let deliveryStart = convert12ToSeconds("8:00:00 am");
    let deliveryEnd = convert12ToSeconds("10:00:00 pm");

    let idle = 0;

    if (start < deliveryStart)
        idle += Math.min(end, deliveryStart) - start;

    if (end > deliveryEnd)
        idle += end - Math.max(start, deliveryEnd);

    return secondsToTime(Math.max(0, idle));
}

// ============================================================
// Function 3
// ============================================================

function getActiveTime(shiftDuration, idleTime) {

    let shift = timeToSeconds(shiftDuration);
    let idle = timeToSeconds(idleTime);

    return secondsToTime(shift - idle);
}

// ============================================================
// Function 4
// ============================================================

function metQuota(date, activeTime) {

    let active = timeToSeconds(activeTime);

    let eidStart = new Date("2025-04-10");
    let eidEnd = new Date("2025-04-30");
    let current = new Date(date);

    let quota;

    if (current >= eidStart && current <= eidEnd)
        quota = timeToSeconds("6:00:00");
    else
        quota = timeToSeconds("8:24:00");

    return active >= quota;
}

// ============================================================
// Function 5
// ============================================================

function addShiftRecord(textFile, shiftObj) {

    let data = fs.readFileSync(textFile, "utf8").trim();
    let lines = data ? data.split("\n") : [];

    for (let line of lines) {
        let p = line.split(",");
        if (p[0] === shiftObj.driverID && p[2] === shiftObj.date)
            return {};
    }

    let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let quota = metQuota(shiftObj.date, activeTime);

    let record = [
        shiftObj.driverID,
        shiftObj.driverName,
        shiftObj.date,
        shiftObj.startTime,
        shiftObj.endTime,
        shiftDuration,
        idleTime,
        activeTime,
        quota,
        false
    ].join(",");

    lines.push(record);

    fs.writeFileSync(textFile, lines.join("\n"));

    return {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: quota,
        hasBonus: false
    };
}

// ============================================================
// Function 6
// ============================================================

function setBonus(textFile, driverID, date, newValue) {

    let lines = fs.readFileSync(textFile, "utf8").split("\n");

    for (let i = 0; i < lines.length; i++) {

        let p = lines[i].split(",");

        if (p[0] === driverID && p[2] === date) {
            p[9] = newValue;
            lines[i] = p.join(",");
        }
    }

    fs.writeFileSync(textFile, lines.join("\n"));
}

// ============================================================
// Function 7
// ============================================================

function countBonusPerMonth(textFile, driverID, month) {

    month = parseInt(month);

    let lines = fs.readFileSync(textFile, "utf8").split("\n");

    let found = false;
    let count = 0;

    for (let line of lines) {

        if (!line.trim()) continue;

        let p = line.split(",");

        if (p[0] === driverID) {

            found = true;

            let recordMonth = parseInt(p[2].split("-")[1]);

            let bonus = p[9].trim();

            if (recordMonth === month && (bonus === "true" || bonus === true)) {
                count++;
            }
        }
    }

    if (!found) return -1;

    return count;
}
// ============================================================
// Function 8
// ============================================================

function getTotalActiveHoursPerMonth(textFile, driverID, month) {

    let lines = fs.readFileSync(textFile, "utf8").trim().split("\n");

    let total = 0;

    for (let line of lines) {

        let p = line.split(",");

        if (p[0] === driverID && getMonth(p[2]) === month)
            total += timeToSeconds(p[7]);
    }

    return secondsToTime(total);
}

// ============================================================
// Function 9
// ============================================================

function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {

    let shifts = fs.readFileSync(textFile, "utf8").trim().split("\n");
    let rates = fs.readFileSync(rateFile, "utf8").trim().split("\n");

    let dayOff;

    for (let r of rates) {
        let p = r.split(",");
        if (p[0] === driverID)
            dayOff = p[1];
    }

    let total = 0;

    for (let line of shifts) {

        let p = line.split(",");

        if (p[0] !== driverID) continue;
        if (getMonth(p[2]) !== month) continue;

        let day = getDayName(p[2]);

        if (day === dayOff) continue;

        let d = new Date(p[2]);

        if (d >= new Date("2025-04-10") && d <= new Date("2025-04-30"))
            total += timeToSeconds("6:00:00");
        else
            total += timeToSeconds("8:24:00");
    }

    total -= bonusCount * 2 * 3600;

    return secondsToTime(total);
}

// ============================================================
// Function 10
// ============================================================

function getNetPay(driverID, actualHours, requiredHours, rateFile) {

    let rates = fs.readFileSync(rateFile, "utf8").trim().split("\n");

    let basePay, tier;

    for (let r of rates) {

        let p = r.split(",");

        if (p[0] === driverID) {
            basePay = parseInt(p[2]);
            tier = parseInt(p[3]);
        }
    }

    let allowed = {1:50,2:20,3:10,4:3}[tier];

    let actual = timeToSeconds(actualHours);
    let required = timeToSeconds(requiredHours);

    if (actual >= required) return basePay;

    let missing = required - actual;

    let missingHours = Math.floor(missing / 3600);

    if (missingHours <= allowed) return basePay;

    let billable = missingHours - allowed;

    let rate = Math.floor(basePay / 185);

    return basePay - billable * rate;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
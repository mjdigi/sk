import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, addDoc, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBGrWKf4qrwrq4G9YYOVUbygHgjiqsdIEk",
    authDomain: "bahubali-529ba.firebaseapp.com",
    projectId: "bahubali-529ba",
    storageBucket: "bahubali-529ba.appspot.com",
    messagingSenderId: "535615132075",
    appId: "1:535615132075:web:cc9acece681f444b6882ee",
    measurementId: "G-RWE7MKGN7J"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentFacultyId = null;
let facultySubjectsArray = []; 
let globalMySchedule = {};
let allAttendanceHistory = [];

/* Report State Variables */
let reportStudents = [];
let reportAttendance = [];
let repYear = 'all', repClass = 'all', repBatch = 'all', repSubject = 'all', repEligibility = 'all';

/* --- Premium UI Helpers --- */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;
    let icon = 'fa-check-circle';
    if(type === 'error') icon = 'fa-times-circle';
    if(type === 'warning') icon = 'fa-exclamation-triangle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

function toggleBtnLoader(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.classList.add('btn-loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    }
}

function formatAMPM(date) {
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    minutes = minutes < 10 ? '0'+minutes : minutes;
    return hours + ':' + minutes + ' ' + ampm;
}
/* ------------------------ */

onAuthStateChanged(auth, async (user) => {
    if (user && localStorage.getItem('userRole') === 'faculty') {
        currentFacultyId = user.uid;
        document.getElementById('facultyName').innerHTML = `<i class="fas fa-user-circle"></i> ${localStorage.getItem('userName') || user.email}`;
        
        await loadFacultySubjects(user.uid);
        loadInitialDropdowns();
        await loadFacultyTimetable();
        await loadAttendanceHistory();
        
    } else {
        window.location.href = 'index.html';
    }
});

async function loadFacultySubjects(uid) {
    try {
        const userDocRef = doc(db, "users", uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists() && userDocSnap.data().subject) {
            const subjectsString = userDocSnap.data().subject;
            facultySubjectsArray = subjectsString.split(',').map(sub => sub.trim()).filter(sub => sub !== "");
            
            const attSubjectDrop = document.getElementById('attSubject');
            const filterSubjectDrop = document.getElementById('filterAttSubject');
            
            attSubjectDrop.innerHTML = '<option value="">Select Subject</option>';
            filterSubjectDrop.innerHTML = '<option value="">All Subjects</option>';
            
            facultySubjectsArray.forEach(sub => {
                let opt1 = document.createElement('option'); opt1.value = sub; opt1.innerText = sub;
                let opt2 = document.createElement('option'); opt2.value = sub; opt2.innerText = sub;
                attSubjectDrop.appendChild(opt1);
                filterSubjectDrop.appendChild(opt2);
            });
        }
    } catch (e) { console.error("Error loading faculty subjects:", e); }
}

async function loadInitialDropdowns() {
    try {
        const q = query(collection(db, "classes")); 
        const snap = await getDocs(q);
        const selectors = [document.getElementById('marksClass')];
        
        document.getElementById('totalClasses').innerText = snap.size;
        
        snap.forEach(doc => {
            const data = doc.data();
            selectors.forEach(sel => {
                let opt = document.createElement('option');
                opt.value = data.id || `${data.course}_${data.semester}`;
                opt.innerText = `${data.course} - Sem ${data.semester}`;
                sel.appendChild(opt);
            });
        });
    } catch (e) { console.error("Error loading classes:", e); }
}

async function loadFacultyTimetable() {
    const tbody = document.getElementById('facultyTimetableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading your schedule...</td></tr>';

    if (facultySubjectsArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No subjects currently assigned to your profile.</td></tr>';
        return;
    }

    try {
        const ttSnap = await getDocs(collection(db, "timetables"));
        const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        const regularDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
        
        allDays.forEach(day => { globalMySchedule[day] = { P1: null, P2: null, P3: null, P4: null, P5: null, P6: null }; });

        ttSnap.forEach(doc => {
            const data = doc.data();
            const className = data.class || "Unknown";
            const yearName = data.year || "Unknown";
            const batchName = data.batch || ""; 
            const schedule = data.schedule || {};
            const weekendSub = data.weekendSubstitute || "None";

            // Process Regular Weekdays
            regularDays.forEach(day => {
                if(schedule[day]) {
                    for(let i=1; i<=6; i++) {
                        const subjectInSlot = schedule[day][`P${i}`];
                        if(subjectInSlot && subjectInSlot !== "-" && facultySubjectsArray.includes(subjectInSlot)) {
                            const bStr = batchName ? ` <span class="badge-batch">B${batchName}</span>` : "";
                            globalMySchedule[day][`P${i}`] = { 
                                subject: subjectInSlot, 
                                classStr: `${className} (${yearName})${bStr}`,
                                rawClass: className,
                                rawYear: yearName,
                                rawBatch: batchName
                            };
                        }
                    }
                }
            });

            // Process Weekend Substitutes
            if (weekendSub !== "None" && schedule[weekendSub]) {
                ["Saturday", "Sunday"].forEach(weekendDay => {
                    for(let i=1; i<=6; i++) {
                        const subjectInSlot = schedule[weekendSub][`P${i}`];
                        if(subjectInSlot && subjectInSlot !== "-" && facultySubjectsArray.includes(subjectInSlot)) {
                            const bStr = batchName ? ` <span class="badge-batch">B${batchName}</span>` : "";
                            globalMySchedule[weekendDay][`P${i}`] = { 
                                subject: subjectInSlot, 
                                classStr: `${className} (${yearName})${bStr}`,
                                rawClass: className,
                                rawYear: yearName,
                                rawBatch: batchName
                            };
                        }
                    }
                });
            }
        });

        tbody.innerHTML = "";
        allDays.forEach(day => {
            let hasClasses = false;
            for(let i=1; i<=6; i++) {
                if (globalMySchedule[day][`P${i}`]) hasClasses = true;
            }
            if ((day === "Saturday" || day === "Sunday") && !hasClasses) return; 

            let tr = document.createElement('tr');
            let dayLabel = day;
            if (day === "Saturday" || day === "Sunday") {
                dayLabel = `${day} <br><small style="color:#f59e0b; font-weight:normal;">(Sub)</small>`;
            }
            tr.innerHTML = `<td><strong style="color:#1e293b;">${dayLabel}</strong></td>`;
            
            for(let i=1; i<=6; i++) {
                const slot = globalMySchedule[day][`P${i}`];
                if(slot) {
                    tr.innerHTML += `<td><div class="tt-slot-active"><span class="tt-subject">${slot.subject}</span><span class="tt-class">${slot.classStr}</span></div></td>`;
                } else {
                    tr.innerHTML += `<td><span class="tt-empty">-</span></td>`;
                }
            }
            tbody.appendChild(tr);
        });

    } catch(e) {
        showToast("Error retrieving schedule data.", "error");
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#ef4444;">Error retrieving your schedule data.</td></tr>';
    }
}

// --- Attendance Section Views & Logic ---
const attHistoryView = document.getElementById('attendanceHistoryView');
const attRecordView = document.getElementById('attendanceRecordView');
const liveSummaryCard = document.getElementById('liveSummaryCard');

document.getElementById('attClass').addEventListener('change', (e) => {
    document.getElementById('attBatch').style.display = (e.target.value === 'MCA') ? 'inline-block' : 'none';
    updateSummaryCard();
});

document.getElementById('filterAttClass').addEventListener('change', (e) => {
    document.getElementById('filterAttBatch').style.display = (e.target.value === 'MCA') ? 'inline-block' : 'none';
    if(e.target.value !== 'MCA') document.getElementById('filterAttBatch').value = 'all';
});

function getCurrentPeriodInfo() {
    const now = new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayStr = days[now.getDay()];

    const hours = now.getHours();
    const mins = now.getMinutes();
    const timeVal = hours + mins/60;

    let period = null;
    if (timeVal >= 10 && timeVal < 11) period = "P1";
    else if (timeVal >= 11 && timeVal < 12) period = "P2";
    else if (timeVal >= 12 && timeVal < 13) period = "P3";
    else if (timeVal >= 14 && timeVal < 15) period = "P4";
    else if (timeVal >= 15 && timeVal < 16) period = "P5";
    else if (timeVal >= 16 && timeVal < 17) period = "P6";

    if (!period) return null;
    return { day: todayStr, period: period };
}

document.getElementById('showAddAttBtn').addEventListener('click', () => {
    attHistoryView.style.display = 'none';
    attRecordView.style.display = 'block';

    document.getElementById('attDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('attHours').value = 1;

    const currentSlot = getCurrentPeriodInfo();
    
    if (currentSlot && globalMySchedule[currentSlot.day]) {
        const slotData = globalMySchedule[currentSlot.day][currentSlot.period];
        if (slotData) {
            document.getElementById('attSubject').value = slotData.subject;
            document.getElementById('attClass').value = slotData.rawClass;
            document.getElementById('attYear').value = slotData.rawYear;
            document.getElementById('attPeriod').value = currentSlot.period;
            
            if (slotData.rawClass === 'MCA') {
                document.getElementById('attBatch').style.display = 'inline-block';
                document.getElementById('attBatch').value = slotData.rawBatch || '1';
            } else {
                document.getElementById('attBatch').style.display = 'none';
            }

            showToast(`Auto-loaded schedule for ${currentSlot.day} ${currentSlot.period}`, 'success');
            document.getElementById('loadStudentsBtn').click();
            return;
        }
    }
    showToast("No active scheduled class found for the current time.", "warning");
    updateSummaryCard();
});

document.getElementById('backToHistoryBtn').addEventListener('click', () => {
    attRecordView.style.display = 'none';
    attHistoryView.style.display = 'block';
    
    document.getElementById('attendanceList').innerHTML = '';
    document.getElementById('attendanceTableContainer').style.display = 'none';
    document.getElementById('saveAttendanceBtn').style.display = 'none';
    liveSummaryCard.style.display = 'none';
});

const attHoursInput = document.getElementById('attHours');
attHoursInput.addEventListener('input', function() {
    if(this.value !== "") {
        if(parseInt(this.value) < 1) this.value = 1;
        if(parseInt(this.value) > 6) this.value = 6;
    }
    updateSummaryCard();
});

function updateSummaryCard() {
    if (liveSummaryCard.style.display === 'none') return;
    
    const dateVal = document.getElementById('attDate').value;
    const yearVal = document.getElementById('attYear').value || '-';
    const classVal = document.getElementById('attClass').value || '-';
    const subVal = document.getElementById('attSubject').value || '-';
    const hoursVal = document.getElementById('attHours').value || '-';
    const batchVal = document.getElementById('attBatch').value;
    const periodVal = document.getElementById('attPeriod').value || '-';
    
    let bStr = (classVal === 'MCA' && batchVal) ? ` B${batchVal}` : '';
    
    const now = new Date();
    const timeStr = formatAMPM(now);
    
    document.getElementById('sumDate').innerText = dateVal ? `${new Date(dateVal).toLocaleDateString()} ${timeStr}` : '-';
    document.getElementById('sumClass').innerText = `${classVal} (${yearVal})${bStr}`;
    document.getElementById('sumSubject').innerText = `${subVal} (${periodVal})`;
    document.getElementById('sumHours').innerText = hoursVal;

    const rows = document.querySelectorAll('#attendanceList tr[data-id]');
    let p = 0, a = 0, o = 0;
    
    rows.forEach(r => {
        if (r.querySelector('.active-p')) p++;
        if (r.querySelector('.active-a')) a++;
        if (r.querySelector('.active-o')) o++;
    });
    
    document.getElementById('countP').innerText = p;
    document.getElementById('countA').innerText = a;
    document.getElementById('countO').innerText = o;
    document.getElementById('countT').innerText = rows.length;
}

['attYear', 'attClass', 'attBatch', 'attSubject', 'attDate', 'attPeriod'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateSummaryCard);
});

// Load Students
const loadStudentsBtn = document.getElementById('loadStudentsBtn');
const attendanceList = document.getElementById('attendanceList');
const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');

loadStudentsBtn.addEventListener('click', async () => {
    const targetYear = document.getElementById('attYear').value;
    const targetClass = document.getElementById('attClass').value;
    const targetSubject = document.getElementById('attSubject').value;
    const targetHours = document.getElementById('attHours').value;
    const targetBatch = document.getElementById('attBatch').value;
    const targetPeriod = document.getElementById('attPeriod').value;

    if(!targetYear || !targetClass || !targetSubject || !targetHours || !targetPeriod) {
        showToast("Please fill Year, Class, Batch, Subject, Period, and Hours to load.", "warning");
        return;
    }

    toggleBtnLoader('loadStudentsBtn', true);

    try {
        const q = query(collection(db, "students"), where("class", "==", targetClass));
        const snap = await getDocs(q);
        
        const filteredStudents = [];
        snap.forEach(doc => {
            const data = doc.data();
            if (data.year === targetYear) {
                if (targetClass !== 'MCA' || data.batch === targetBatch) {
                    filteredStudents.push({ id: doc.id, ...data });
                }
            }
        });

        attendanceList.innerHTML = '';
        document.getElementById('attendanceTableContainer').style.display = 'table';
        liveSummaryCard.style.display = 'flex';

        if(filteredStudents.length === 0) {
            attendanceList.innerHTML = '<tr><td colspan="3" style="text-align:center;">No students found for this class, year, and batch.</td></tr>';
            saveAttendanceBtn.style.display = 'none';
        } else {
            filteredStudents.forEach(student => {
                const row = document.createElement('tr');
                row.setAttribute('data-id', student.id);
                row.innerHTML = `
                    <td><span style="background:#f1f5f9; padding:6px 10px; border-radius:6px; font-size:13px; font-weight:600; color:#475569;">${student.rollNo || 'N/A'}</span></td>
                    <td><div style="font-weight:600; color:#1e293b; font-size:15px;">${student.name}</div></td>
                    <td>
                        <div class="attendance-toggle">
                            <span class="toggle-p active-p">Present</span>
                            <span class="toggle-a">Absent</span>
                            <span class="toggle-o">OD</span>
                        </div>
                    </td>`;
                
                const toggles = row.querySelectorAll('.toggle-p, .toggle-a, .toggle-o');
                toggles.forEach(t => {
                    t.addEventListener('click', function() {
                        toggles.forEach(btn => btn.classList.remove('active-p', 'active-a', 'active-o'));
                        if (this.classList.contains('toggle-p')) this.classList.add('active-p');
                        if (this.classList.contains('toggle-a')) this.classList.add('active-a');
                        if (this.classList.contains('toggle-o')) this.classList.add('active-o');
                        updateSummaryCard();
                    });
                });
                attendanceList.appendChild(row);
            });
            showToast("Students loaded successfully.", "success");
            saveAttendanceBtn.style.display = 'flex';
        }
        updateSummaryCard();
    } catch (error) {
        console.error(error);
        showToast("Error loading students.", "error");
    } finally {
        toggleBtnLoader('loadStudentsBtn', false);
    }
});

// Save Attendance (With Double-Mark Prevention)
saveAttendanceBtn.addEventListener('click', async () => {
    const rows = attendanceList.querySelectorAll('tr[data-id]');
    const date = document.getElementById('attDate').value;
    const subject = document.getElementById('attSubject').value;
    const hours = document.getElementById('attHours').value;
    const year = document.getElementById('attYear').value;
    const classVal = document.getElementById('attClass').value;
    const periodVal = document.getElementById('attPeriod').value;
    const batchVal = (classVal === 'MCA') ? document.getElementById('attBatch').value : '';

    if(!date) { showToast("Please select a date.", "warning"); return; }
    if(!periodVal) { showToast("Please select a Period (e.g., P1).", "warning"); return; }

    try {
        toggleBtnLoader('saveAttendanceBtn', true);
        
        const duplicateCheckQuery = query(
            collection(db, "attendance"), 
            where("class", "==", classVal),
            where("year", "==", year),
            where("date", "==", date),
            where("period", "==", periodVal)
        );
        const dupSnap = await getDocs(duplicateCheckQuery);
        
        let isDuplicate = false;
        dupSnap.forEach(d => {
            const data = d.data();
            if (data.batch === batchVal) {
                isDuplicate = true;
            }
        });

        if (isDuplicate) {
            showToast(`Attendance for ${classVal} (${year}) - ${periodVal} on ${date} has already been marked!`, "error");
            toggleBtnLoader('saveAttendanceBtn', false);
            return; 
        }
        
        const nowTime = formatAMPM(new Date());

        for(let row of rows) {
            const studentId = row.getAttribute('data-id');
            let status = 'Present'; 
            if (row.querySelector('.active-a')) status = 'Absent';
            if (row.querySelector('.active-o')) status = 'OD';

            await addDoc(collection(db, "attendance"), {
                studentId, date, time: nowTime, subject, status, hours,
                year, class: classVal, batch: batchVal, period: periodVal,
                facultyId: currentFacultyId,
                timestamp: serverTimestamp()
            });
        }
        showToast("Attendance saved successfully!", "success");
        await loadAttendanceHistory();
        document.getElementById('backToHistoryBtn').click(); 
    } catch(e) { 
        console.error(e); 
        showToast("Error saving attendance.", "error"); 
    }
    finally { 
        toggleBtnLoader('saveAttendanceBtn', false); 
    }
});

// History Loading & Rendering
async function loadAttendanceHistory() {
    const tbody = document.getElementById('attendanceHistoryList');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading records...</td></tr>';
    
    try {
        const q = query(collection(db, "attendance"), where("facultyId", "==", currentFacultyId));
        const snap = await getDocs(q);
        const historyMap = {};
        
        snap.forEach(doc => {
            const data = doc.data();
            const batchVal = data.batch || '';
            const periodVal = data.period || 'N/A';
            const timeVal = data.time || '';
            
            const key = `${data.date}_${data.class}_${data.year}_${batchVal}_${data.subject}_${data.hours}_${periodVal}`;
            
            if (!historyMap[key]) {
                historyMap[key] = {
                    date: data.date,
                    time: timeVal,
                    period: periodVal,
                    class: data.class,
                    year: data.year,
                    batch: batchVal,
                    subject: data.subject,
                    hours: data.hours || 1,
                    total: 0,
                    present: 0,
                    absent: 0,
                    od: 0
                };
            }
            
            historyMap[key].total++;
            if(data.status === 'Present') historyMap[key].present++;
            if(data.status === 'Absent') historyMap[key].absent++;
            if(data.status === 'OD') historyMap[key].od++;
        });
        
        allAttendanceHistory = Object.values(historyMap);
        allAttendanceHistory.sort((a,b) => new Date(b.date) - new Date(a.date));
        renderHistoryTable(allAttendanceHistory);
        
        if(allAttendanceHistory.length > 0) {
            const todayStr = new Date().toISOString().split('T')[0];
            const hasToday = allAttendanceHistory.some(r => r.date === todayStr);
            document.getElementById('todayAttStatus').innerText = hasToday ? "Submitted" : "Pending";
            document.getElementById('todayAttStatus').style.color = hasToday ? "#10b981" : "#f59e0b";
        }
    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;">Error loading history.</td></tr>';
    }
}

function renderHistoryTable(dataArray) {
    const tbody = document.getElementById('attendanceHistoryList');
    tbody.innerHTML = '';
    if(dataArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: #64748b;">No matching attendance records found.</td></tr>';
        return;
    }
    
    dataArray.forEach((item, index) => {
        const tr = document.createElement('tr');
        let bStr = item.batch ? ` <span class="badge-batch">B${item.batch}</span>` : '';
        let displayTime = item.time ? `<br><small style="color:#94a3b8; font-weight:normal;">${item.time}</small>` : '';
        
        tr.innerHTML = `
            <td><div style="font-weight:600; color:#1e293b;">${item.date}${displayTime}</div></td>
            <td><span style="background: rgba(59,130,246,0.1); color: #3b82f6; padding: 4px 8px; border-radius: 6px; font-weight: 600;">${item.period}</span></td>
            <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:6px; font-weight:500; font-size:13px;">${item.class} (${item.year})${bStr}</span></td>
            <td><span style="color:#059669; font-weight:600;">${item.subject}</span></td>
            <td><span style="background: rgba(16,185,129,0.1); color: #10b981; padding: 4px 8px; border-radius: 6px; font-weight: 600;">${item.hours} hrs</span></td>
            <td>
                <div class="status-pill-group">
                    <span style="background: rgba(16,185,129,0.1); color: #10b981;">P: ${item.present}</span>
                    <span style="background: rgba(239,68,68,0.1); color: #ef4444;">A: ${item.absent}</span>
                    <span style="background: rgba(245,158,11,0.1); color: #f59e0b;">OD: ${item.od}</span>
                    <span style="background: #e2e8f0; color: #334155;">T: ${item.total}</span>
                </div>
            </td>
            <td><button class="btn-edit-action" title="Edit this session"><i class="fas fa-edit"></i></button></td>
        `;
        
        tr.querySelector('.btn-edit-action').addEventListener('click', () => {
             showToast("Edit mode coming soon.", "warning");
        });
        
        tbody.appendChild(tr);
    });
}

// History Filters
document.getElementById('applyAttFiltersBtn').addEventListener('click', () => {
    const search = document.getElementById('searchAttHistory').value.toLowerCase();
    const year = document.getElementById('filterAttYear').value;
    const cls = document.getElementById('filterAttClass').value;
    const batch = document.getElementById('filterAttBatch').value;
    const sub = document.getElementById('filterAttSubject').value;
    const date = document.getElementById('filterAttDate').value;
    
    const filtered = allAttendanceHistory.filter(item => {
        const matchSearch = item.class.toLowerCase().includes(search) || item.subject.toLowerCase().includes(search);
        const matchYear = !year || item.year === year;
        const matchClass = !cls || item.class === cls;
        const matchBatch = batch === 'all' || item.batch === batch || item.class !== 'MCA';
        const matchSub = !sub || item.subject === sub;
        const matchDate = !date || item.date === date;
        
        return matchSearch && matchYear && matchClass && matchBatch && matchSub && matchDate;
    });
    
    renderHistoryTable(filtered);
    showToast("Filters applied successfully.", "success");
});

// --- NEW: COMPREHENSIVE ATTENDANCE REPORTS (Faculty) ---

document.querySelectorAll('.report-cards').forEach(container => {
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.report-card');
        if (!card) return;
        
        Array.from(container.children).forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        
        const val = card.getAttribute('data-val');
        const parentId = container.id;
        
        if (parentId === 'rc-year') repYear = val;
        if (parentId === 'rc-class') {
            repClass = val;
            if (val === 'MCA') {
                document.getElementById('level-batch').style.display = 'block';
            } else {
                document.getElementById('level-batch').style.display = 'none';
                repBatch = 'all';
                document.querySelectorAll('#rc-batch .report-card').forEach(c => c.classList.remove('active'));
                document.querySelector('#rc-batch .report-card[data-val="all"]').classList.add('active');
            }
        }
        if (parentId === 'rc-batch') repBatch = val;
        if (parentId === 'rc-subject') repSubject = val;
        if (parentId === 'rc-eligibility') repEligibility = val;
        
        renderReportTable();
    });
});

document.getElementById('refreshReportsBtn').addEventListener('click', loadReportData);

async function loadReportData() {
    const tbody = document.getElementById('attendanceReportList');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Fetching comprehensive report data...</td></tr>';
    
    try {
        const [stuSnap, attSnap] = await Promise.all([
            getDocs(collection(db, "students")),
            // Query only attendance marked by THIS faculty member
            getDocs(query(collection(db, "attendance"), where("facultyId", "==", currentFacultyId)))
        ]);
        
        reportStudents = [];
        stuSnap.forEach(doc => { reportStudents.push({ id: doc.id, ...doc.data() }); });
        
        reportAttendance = [];
        attSnap.forEach(doc => {
            reportAttendance.push(doc.data());
        });
        
        // Render Dynamic Subject Cards based on Faculty's assigned subjects
        const subContainer = document.getElementById('rc-subject');
        subContainer.innerHTML = '<div class="report-card active" data-val="all">All My Subjects</div>';
        facultySubjectsArray.forEach(sub => {
            subContainer.innerHTML += `<div class="report-card" data-val="${sub}">${sub}</div>`;
        });
        
        if (repSubject !== 'all' && facultySubjectsArray.includes(repSubject)) {
            document.querySelector('#rc-subject .report-card[data-val="all"]').classList.remove('active');
            const targetCard = document.querySelector(`#rc-subject .report-card[data-val="${repSubject}"]`);
            if(targetCard) targetCard.classList.add('active');
        } else {
            repSubject = 'all';
        }
        
        renderReportTable();
        showToast("Report data updated.", "success");
    } catch (e) {
        console.error("Error loading reports", e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error loading report data.</td></tr>';
        showToast("Error loading attendance reports.", "error");
    }
}

function renderReportTable() {
    const tbody = document.getElementById('attendanceReportList');
    tbody.innerHTML = '';
    
    let grouped = {};
    
    reportAttendance.forEach(att => {
        const key = att.studentId + "_" + att.subject;
        if (!grouped[key]) {
            grouped[key] = { studentId: att.studentId, subject: att.subject, p: 0, a: 0, o: 0, t: 0 };
        }
        grouped[key].t++;
        if(att.status === 'Present') grouped[key].p++;
        else if(att.status === 'Absent') grouped[key].a++;
        else if(att.status === 'OD') grouped[key].o++;
    });
    
    let html = '';
    let count = 0;

    for (let key in grouped) {
        const data = grouped[key];
        const student = reportStudents.find(s => s.id === data.studentId);
        
        if (!student) continue;
        
        if (repYear !== 'all' && student.year !== repYear) continue;
        if (repClass !== 'all' && student.class !== repClass) continue;
        if (repClass === 'MCA' && repBatch !== 'all' && student.batch !== repBatch) continue;
        if (repSubject !== 'all' && data.subject !== repSubject) continue;
        
        const effectiveP = data.p + data.o;
        const percentage = data.t > 0 ? ((effectiveP / data.t) * 100).toFixed(1) : 0;
        
        let currentElig = '';
        let eligHtml = '';
        let pctColor = '#ef4444'; 
        
        if (percentage >= 75) {
            currentElig = 'Eligible';
            eligHtml = '<span class="badge success"><i class="fas fa-check"></i> Eligible</span>';
            pctColor = '#10b981'; 
        }
        else if (percentage >= 65) {
            currentElig = 'Condonation';
            eligHtml = '<span class="badge warning"><i class="fas fa-exclamation-triangle"></i> Condonation</span>';
            pctColor = '#f59e0b'; 
        }
        else {
            currentElig = 'Not Eligible';
            eligHtml = '<span class="badge danger"><i class="fas fa-times"></i> Not Eligible</span>';
        }

        if (repEligibility !== 'all' && currentElig !== repEligibility) continue;
        
        count++;

        const bStr = (student.class === 'MCA' && student.batch) ? ` <span class="badge-batch">B${student.batch}</span>` : '';

        html += `
            <tr>
                <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:6px; font-weight:600; font-size:13px; color:#475569;">${student.rollNo || 'N/A'}</span></td>
                <td>
                    <div style="font-weight:600; color:#1e293b;">${student.name}</div>
                    <small style="color:#94a3b8; font-weight:500;">${student.class} (${student.year})${bStr}</small>
                </td>
                <td><span style="color:#059669; font-weight:600;">${data.subject}</span></td>
                <td>
                    <div class="status-pill-group">
                        <span style="background: rgba(16,185,129,0.1); color: #10b981;">P: ${data.p}</span>
                        <span style="background: rgba(239,68,68,0.1); color: #ef4444;">A: ${data.a}</span>
                        <span style="background: rgba(245,158,11,0.1); color: #f59e0b;">OD: ${data.o}</span>
                        <span style="background: #e2e8f0; color: #334155;">T: ${data.t}</span>
                    </div>
                </td>
                <td><strong style="color: ${pctColor}; font-size:15px;">${percentage}%</strong></td>
                <td>${eligHtml}</td>
            </tr>
        `;
    }
    
    if (count === 0) {
        html = '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No records matched your filters.</td></tr>';
    }
    
    tbody.innerHTML = html;
}

// Sidebar & Navigation Logic
document.querySelectorAll('.nav-links li').forEach(link => {
    link.addEventListener('click', async () => {
        document.querySelectorAll('.content-section, .nav-links li').forEach(el => el.classList.remove('active'));
        link.classList.add('active');
        const target = link.dataset.target;
        if(document.getElementById(target)) {
            document.getElementById(target).classList.add('active');
            document.getElementById('pageTitle').innerText = link.innerText;
        }

        if (target === 'attendance-reports') {
            await loadReportData();
        }
    });
});

document.getElementById('logoutBtn').onclick = () => {
    signOut(auth).then(() => { localStorage.clear(); window.location.href = 'index.html'; });
};
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, addDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// 1. Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBGrWKf4qrwrq4G9YYOVUbygHgjiqsdIEk",
    authDomain: "bahubali-529ba.firebaseapp.com",
    projectId: "bahubali-529ba",
    storageBucket: "bahubali-529ba.firebasestorage.app",
    messagingSenderId: "535615132075",
    appId: "1:535615132075:web:cc9acece681f444b6882ee",
    measurementId: "G-RWE7MKGN7J"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Global State
let currentUser = null;
let studentProfileData = null;
let currentTimetableData = null; 

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
/* ------------------------ */

// --- Authentication & Initialization ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Verify Role (Security Check)
        const storedRole = localStorage.getItem('userRole');
        if (storedRole !== 'student') {
            window.location.href = 'index.html'; 
            return;
        }

        currentUser = user;
        document.getElementById('welcomeMessage').innerText = `Welcome, ${localStorage.getItem('userName') || 'Student'}`;
        
        await fetchStudentProfile();
        
        loadAttendance();
        loadMarks();
        loadActivities();
        await loadTimetable(); 
        
        // Starts the live dashboard tracker
        updateLiveDashboardStatus();
        setInterval(updateLiveDashboardStatus, 60000); // Check every minute
    } else {
        window.location.href = 'index.html';
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = 'index.html';
    });
});

// --- UI Navigation Logic ---
const navLinks = document.querySelectorAll('.nav-links li');
const sections = document.querySelectorAll('.content-section');
const pageTitle = document.getElementById('pageTitle');

navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(nav => nav.classList.remove('active'));
        link.classList.add('active');

        sections.forEach(sec => sec.classList.remove('active'));
        const targetId = link.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');

        pageTitle.innerText = link.innerText;
    });
});

// --- Core Functions ---

async function fetchStudentProfile() {
    try {
        const docRef = doc(db, "students", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            studentProfileData = docSnap.data();
        }
    } catch (error) {
        showToast("Error fetching profile data.", "error");
        console.error("Error fetching profile:", error);
    }
}

async function loadAttendance() {
    const tableBody = document.getElementById('attendanceTableBody');
    const cardsContainer = document.getElementById('subjectAttendanceCards');
    
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Loading attendance records...</td></tr>';
    if (cardsContainer) cardsContainer.innerHTML = '';
    
    let totalSessions = 0, present = 0, absent = 0, od = 0;
    let subjectStats = {}; 

    try {
        const q = query(collection(db, "attendance"), where("studentId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        tableBody.innerHTML = '';

        if(querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8;">No attendance records found yet.</td></tr>';
            document.getElementById('dashAttendance').innerText = '0%';
            return;
        }
        
        const records = [];
        querySnapshot.forEach((doc) => {
            records.push(doc.data());
        });
        
        // Sort by date (newest first)
        records.sort((a,b) => new Date(b.date) - new Date(a.date));

        records.forEach(data => {
            totalSessions++;
            if (data.status === 'Present') present++;
            else if (data.status === 'Absent') absent++;
            else if (data.status === 'OD') od++;

            // Accumulate Subject-specific Stats
            if (!subjectStats[data.subject]) {
                subjectStats[data.subject] = { p: 0, a: 0, o: 0, t: 0 };
            }
            subjectStats[data.subject].t++;
            if (data.status === 'Present') subjectStats[data.subject].p++;
            else if (data.status === 'Absent') subjectStats[data.subject].a++;
            else if (data.status === 'OD') subjectStats[data.subject].o++;

            const timeDisplay = data.time ? `<br><small style="color:#94a3b8; font-weight:normal;">${data.time}</small>` : '';
            const periodDisplay = data.period || 'N/A';
            const hoursDisplay = data.hours ? `${data.hours} hr` : '1 hr';
            
            let statusBadge = '';
            if (data.status === 'Present') statusBadge = '<span class="badge success">Present</span>';
            else if (data.status === 'Absent') statusBadge = '<span class="badge danger">Absent</span>';
            else if (data.status === 'OD') statusBadge = '<span class="badge warning">On Duty (OD)</span>';

            tableBody.innerHTML += `
                <tr>
                    <td><div style="font-weight: 600; color: #1e293b;">${data.date}${timeDisplay}</div></td>
                    <td><span style="background: rgba(59,130,246,0.1); color: #3b82f6; padding: 4px 8px; border-radius: 6px; font-weight: 600;">${periodDisplay}</span></td>
                    <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:6px; font-size:13px; font-weight:500;">${data.subject}</span></td>
                    <td><span style="color:#64748b; font-weight:500;">${hoursDisplay}</span></td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        });

        // Update Overall Summary Badges
        document.getElementById('attTotal').innerHTML = `<i class="fas fa-layer-group"></i> Total Sessions: ${totalSessions}`;
        document.getElementById('attPresent').innerHTML = `<i class="fas fa-check-circle"></i> Present: ${present}`;
        document.getElementById('attAbsent').innerHTML = `<i class="fas fa-times-circle"></i> Absent: ${absent}`;
        document.getElementById('attOd').innerHTML = `<i class="fas fa-briefcase"></i> OD: ${od}`;
        
        // Overall Eligibility Logic
        const totalEffectivePresent = present + od;
        const percentage = totalSessions > 0 ? ((totalEffectivePresent / totalSessions) * 100).toFixed(1) : 0;
        document.getElementById('dashAttendance').innerText = `${percentage}%`;
        
        const eligibilityBadge = document.getElementById('attEligibility');
        if (percentage >= 75) {
            eligibilityBadge.innerHTML = `<i class="fas fa-shield-alt"></i> Eligibility: Safe (${percentage}%)`;
            eligibilityBadge.style.background = '#10b981';
        } else if (totalSessions > 0) {
            eligibilityBadge.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Eligibility: Shortage (${percentage}%)`;
            eligibilityBadge.style.background = '#ef4444';
        }

        // Render Subject-wise Cards
        if (cardsContainer) {
            let cardsHTML = '';
            for (const [subject, stats] of Object.entries(subjectStats)) {
                const effectivePresentSub = stats.p + stats.o;
                const percentSub = stats.t > 0 ? ((effectivePresentSub / stats.t) * 100).toFixed(1) : 0;
                
                let statusText = '';
                let statusClass = '';
                let barColor = '';

                if (percentSub >= 75) {
                    statusText = 'Eligible';
                    statusClass = 'success';
                    barColor = '#10b981';
                } else if (percentSub >= 65) {
                    statusText = 'Condonation';
                    statusClass = 'warning';
                    barColor = '#f59e0b';
                } else {
                    statusText = 'Not Eligible';
                    statusClass = 'danger';
                    barColor = '#ef4444';
                }

                cardsHTML += `
                    <div class="subject-card">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <h4 title="${subject}">${subject.length > 20 ? subject.substring(0, 18) + '...' : subject}</h4>
                            <span class="badge ${statusClass}" style="font-size: 10px; padding: 2px 6px;">${statusText}</span>
                        </div>
                        <div style="font-size: 22px; font-weight: 700; color: #1e293b; margin-top: 5px;">${percentSub}%</div>
                        <div class="progress-container">
                            <div class="progress-bar" style="width: ${percentSub}%; background-color: ${barColor};"></div>
                        </div>
                        <div class="subject-stats-row">
                            <span title="Present" style="color: #10b981;">P: ${stats.p}</span>
                            <span title="Absent" style="color: #ef4444;">A: ${stats.a}</span>
                            <span title="On Duty" style="color: #f59e0b;">OD: ${stats.o}</span>
                            <span title="Total" style="color: #3b82f6;">T: ${stats.t}</span>
                        </div>
                    </div>
                `;
            }
            cardsContainer.innerHTML = cardsHTML;
        }

    } catch (error) {
        console.error("Error loading attendance:", error);
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color:#ef4444;">Error loading attendance data.</td></tr>';
    }
}

async function loadMarks() {
    // Placeholder implementation
}

async function loadActivities() {
    const tableBody = document.getElementById('activitiesTableBody');
    tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    let activityCount = 0;
    
    try {
        const q = query(collection(db, "activities"), where("studentId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        tableBody.innerHTML = '';

        if(querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8;">No activities recorded.</td></tr>';
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            activityCount++;
            tableBody.innerHTML += `
                <tr>
                    <td><div style="font-weight: 500;">${data.date}</div></td>
                    <td><span class="badge" style="background: rgba(139,92,246,0.1); color: #8b5cf6; border: none;">${data.category}</span></td>
                    <td style="font-weight: 600; color: #1e293b;">${data.title}</td>
                </tr>
            `;
        });
        document.getElementById('dashAchievements').innerText = activityCount;
    } catch(e) { 
        console.error(e); 
        tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color:#ef4444;">Error loading activities.</td></tr>';
    }
}

async function loadTimetable() {
    const ttBody = document.getElementById('timetableBody');
    const classDisplay = document.getElementById('ttClassNameDisplay');
    
    ttBody.innerHTML = '<tr><td colspan=\"7\" style=\"text-align:center;\"><i class=\"fas fa-spinner fa-spin\"></i> Loading timetable...</td></tr>';

    if (!studentProfileData || !studentProfileData.class || !studentProfileData.year) {
        ttBody.innerHTML = '<tr><td colspan=\"7\" style=\"text-align:center;\">Class or Year information not found.</td></tr>';
        classDisplay.innerHTML = "<i class='fas fa-exclamation-circle'></i> No Class/Year Assigned";
        return;
    }

    let className = studentProfileData.class;
    const yearName = studentProfileData.year;
    let bStr = '';
    
    let ttDocId = `${className}_${yearName.replace(' ', '_')}`;
    if (className === 'MCA' && studentProfileData.batch) {
        ttDocId += `_B${studentProfileData.batch}`;
        bStr = ` (Batch ${studentProfileData.batch})`;
    }

    classDisplay.innerHTML = `<i class="fas fa-calendar-alt"></i> Schedule for: ${className} (${yearName})${bStr}`;

    try {
        const docSnap = await getDoc(doc(db, "timetables", ttDocId));
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentTimetableData = data.schedule; 
            const weekendSub = data.weekendSubstitute || "None";
            
            // Attach weekend schedule to cache for live dashboard
            if (weekendSub !== "None" && currentTimetableData[weekendSub]) {
                currentTimetableData["Saturday"] = currentTimetableData[weekendSub];
                currentTimetableData["Sunday"] = currentTimetableData[weekendSub];
            }
            
            ttBody.innerHTML = ''; 
            
            const displayDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

            displayDays.forEach(day => {
                // If it is a weekend and there is no substitute data for it, skip rendering the row
                if ((day === "Saturday" || day === "Sunday") && (!currentTimetableData[day] || weekendSub === "None")) return;
                
                let tr = document.createElement('tr');
                let dayLabel = day;
                
                if (day === "Saturday" || day === "Sunday") {
                    dayLabel = `${day} <br><small style="color:#f59e0b; font-weight:normal;">(Sub)</small>`;
                }
                
                let tdDay = document.createElement('td');
                tdDay.innerHTML = `<strong style="color:#1e293b;">${dayLabel}</strong>`;
                tr.appendChild(tdDay);

                for(let i = 1; i <= 6; i++) {
                    let td = document.createElement('td');
                    const subject = currentTimetableData[day] && currentTimetableData[day][`P${i}`] ? currentTimetableData[day][`P${i}`] : "-";
                    
                    if (subject !== "-") {
                        td.innerHTML = `<div class="tt-slot-active">${subject}</div>`;
                    } else {
                        td.innerHTML = `<span style="color: #cbd5e1; font-weight: 500;">-</span>`;
                    }
                    tr.appendChild(td);
                }
                ttBody.appendChild(tr);
            });
        } else {
            currentTimetableData = null;
            ttBody.innerHTML = '<tr><td colspan=\"7\" style=\"text-align:center; color: #94a3b8;\">No timetable published for your class yet.</td></tr>';
        }
    } catch (error) {
        currentTimetableData = null;
        console.error("Error loading timetable:", error);
    }
}

// --- Live Dashboard Tracker ---
function updateLiveDashboardStatus() {
    const displayCard = document.getElementById('dashUpcomingClass');
    if (!displayCard) return;

    if (!currentTimetableData) {
        displayCard.innerHTML = `<h4>Unavailable</h4><p>Schedule not published yet.</p>`;
        return;
    }

    const now = new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayStr = days[now.getDay()];

    const todaySchedule = currentTimetableData[todayStr];
    
    if (!todaySchedule) {
        if (todayStr === "Sunday" || todayStr === "Saturday") {
            displayCard.innerHTML = `<h4>Weekend</h4><p>No Classes Scheduled</p>`;
        } else {
            displayCard.innerHTML = `<h4>Free Day</h4><p>No Classes Scheduled Today</p>`;
        }
        return;
    }

    const hours = now.getHours();
    const mins = now.getMinutes();
    const timeVal = hours + (mins/60);

    let statusHtml = "";

    // 12 AM to 10 AM
    if (timeVal < 10) {
        const firstClass = todaySchedule["P1"] !== "-" ? todaySchedule["P1"] : "Free Period";
        statusHtml = `<h4>Classes Start at 10:00 AM</h4><p>First Period: ${firstClass}</p>`;
    } 
    // 10 AM to 5 PM Active Schedule tracking
    else if (timeVal >= 10 && timeVal < 17) {
        if (timeVal >= 10 && timeVal < 11) {
            const sub = todaySchedule["P1"] !== "-" ? todaySchedule["P1"] : "Free Period";
            statusHtml = `<h4>Period 1 (10 AM - 11 AM)</h4><p>Now: ${sub}</p>`;
        } else if (timeVal >= 11 && timeVal < 12) {
            const sub = todaySchedule["P2"] !== "-" ? todaySchedule["P2"] : "Free Period";
            statusHtml = `<h4>Period 2 (11 AM - 12 PM)</h4><p>Now: ${sub}</p>`;
        } else if (timeVal >= 12 && timeVal < 13) {
            const sub = todaySchedule["P3"] !== "-" ? todaySchedule["P3"] : "Free Period";
            statusHtml = `<h4>Period 3 (12 PM - 1 PM)</h4><p>Now: ${sub}</p>`;
        } else if (timeVal >= 13 && timeVal < 14) {
            statusHtml = `<h4 style="color: #f59e0b;"><i class="fas fa-utensils"></i> Lunch Break</h4><p>1:00 PM - 2:00 PM</p>`;
        } else if (timeVal >= 14 && timeVal < 15) {
            const sub = todaySchedule["P4"] !== "-" ? todaySchedule["P4"] : "Free Period";
            statusHtml = `<h4>Period 4 (2 PM - 3 PM)</h4><p>Now: ${sub}</p>`;
        } else if (timeVal >= 15 && timeVal < 16) {
            const sub = todaySchedule["P5"] !== "-" ? todaySchedule["P5"] : "Free Period";
            statusHtml = `<h4>Period 5 (3 PM - 4 PM)</h4><p>Now: ${sub}</p>`;
        } else if (timeVal >= 16 && timeVal < 17) {
            const sub = todaySchedule["P6"] !== "-" ? todaySchedule["P6"] : "Free Period";
            statusHtml = `<h4>Period 6 (4 PM - 5 PM)</h4><p>Now: ${sub}</p>`;
        }
    } 
    // 5 PM to 11:59 PM
    else {
        statusHtml = `<h4>Classes Concluded</h4><p>See you tomorrow!</p>`;
    }

    displayCard.innerHTML = statusHtml;
}

// --- Add Achievement (Storage + Firestore) ---
const achievementForm = document.getElementById('achievementForm');

achievementForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleBtnLoader('submitAchvBtn', true);

    const title = document.getElementById('achvTitle').value;
    const category = document.getElementById('achvCategory').value;
    const date = document.getElementById('achvDate').value;
    const file = document.getElementById('achvFile').files[0];

    try {
        const fileRef = ref(storage, `achievements/${currentUser.uid}/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(fileRef);

        await addDoc(collection(db, "activities"), {
            studentId: currentUser.uid,
            title: title,
            category: category,
            date: date,
            certificateUrl: downloadURL,
            timestamp: new Date()
        });

        showToast("Achievement uploaded and saved successfully!", "success");
        achievementForm.reset();
        loadActivities();
    } catch (error) {
        console.error("Upload error:", error);
        showToast("Error uploading achievement: " + error.message, "error");
    } finally {
        toggleBtnLoader('submitAchvBtn', false);
    }
});
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

let allUsersData = [];
let facultySubjects = [];
let allTimetablesCache = {}; 

/* Report State Variables */
let reportStudents = [];
let reportAttendance = [];
let reportSubjectsSet = new Set();
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

function showConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirmOverlay');
        const acceptBtn = document.getElementById('acceptConfirmBtn');
        document.getElementById('confirmMessage').innerText = message;
        overlay.style.display = 'flex';

        acceptBtn.onclick = () => {
            toggleBtnLoader('acceptConfirmBtn', true);
            setTimeout(() => { 
                overlay.style.display = 'none';
                toggleBtnLoader('acceptConfirmBtn', false);
                resolve(true);
            }, 500);
        };
        document.getElementById('cancelConfirmBtn').onclick = () => {
            overlay.style.display = 'none';
            resolve(false);
        };
    });
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

onAuthStateChanged(auth, (user) => {
    if (user && localStorage.getItem('userRole') === 'admin') {
        updateDashboardCounts();
        loadUserTable();
    } else {
        window.location.href = 'index.html';
    }
});

async function updateDashboardCounts() {
    try {
        const studentsSnap = await getDocs(collection(db, "students"));
        const usersSnap = await getDocs(collection(db, "users"));
        const classesSnap = await getDocs(collection(db, "classes"));
        document.getElementById('countStudents').innerText = studentsSnap.size;
        document.getElementById('countClasses').innerText = classesSnap.size;
        let facultyCount = 0;
        usersSnap.forEach(doc => { if(doc.data().role === 'faculty') facultyCount++; });
        document.getElementById('countFaculty').innerText = facultyCount;
    } catch (e) { console.error(e); }
}

async function loadUserTable() {
    const userTableBody = document.getElementById('userTableBody');
    userTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading users database...</td></tr>';
    try {
        const studentsSnap = await getDocs(collection(db, "students"));
        const studentsData = {};
        studentsSnap.forEach(doc => { studentsData[doc.id] = doc.data(); });

        const snap = await getDocs(collection(db, "users"));
        allUsersData = [];
        const subjectsSet = new Set();
        
        snap.forEach(doc => { 
            let data = doc.data();
            if(data.role === 'student' && studentsData[doc.id]) {
                data.class = data.class || studentsData[doc.id].class;
                data.year = data.year || studentsData[doc.id].year;
                data.batch = studentsData[doc.id].batch || data.batch || ''; 
            }
            if(data.role === 'faculty' && data.subject) {
                const subjectArray = data.subject.split(',');
                subjectArray.forEach(sub => {
                    const trimmedSub = sub.trim();
                    if(trimmedSub) subjectsSet.add(trimmedSub);
                });
            }
            allUsersData.push({ id: doc.id, ...data }); 
        });

        facultySubjects = Array.from(subjectsSet);
        initTimetableGrid(); 
        renderUsers(allUsersData);
    } catch (e) { 
        userTableBody.innerHTML = '<tr><td colspan="6" style="color:red; text-align:center;">Failed to load user data.</td></tr>'; 
        showToast("Error loading user data", "error");
    }
}

function renderUsers(users) {
    const userTableBody = document.getElementById('userTableBody');
    userTableBody.innerHTML = "";
    if (users.length === 0) {
        userTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No users found.</td></tr>';
        return;
    }
    users.forEach(user => {
        let classDisplay = user.class || '-';
        if(user.class === 'MCA' && user.batch) {
            classDisplay += ` <span class="badge-batch">B${user.batch}</span>`;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div style="font-weight:600; color:#1e293b; margin-bottom:4px;">${user.name || 'Unknown'}</div>
                <span class="badge ${user.role}">${user.role.toUpperCase()}</span>
            </td>
            <td><div style="font-weight:500;">${classDisplay}</div><small style="color:#94a3b8;">${user.rollNo || ''}</small></td>
            <td>${user.year || '-'}</td>
            <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:6px; font-size:12px;">${user.subject || '-'}</span></td>
            <td><a href="mailto:${user.email}" style="color:#3b82f6; text-decoration:none;">${user.email || '-'}</a></td>
            <td>
                <button class="btn-warning-sm edit-btn" data-id="${user.id}"><i class="fas fa-edit"></i></button>
                <button class="btn-danger-sm delete-btn" data-id="${user.id}" data-role="${user.role}"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        userTableBody.appendChild(row);
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openEditModal(e.currentTarget.getAttribute('data-id')));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const userId = e.currentTarget.getAttribute('data-id');
            const userRole = e.currentTarget.getAttribute('data-role');
            if (await showConfirm("Are you sure you want to delete this user? This action will permanently remove them from the database.")) {
                await deleteUserData(userId, userRole);
            }
        });
    });
}

async function deleteUserData(userId, role) {
    try {
        await deleteDoc(doc(db, "users", userId));
        if (role === 'student') await deleteDoc(doc(db, "students", userId));
        showToast("User successfully removed", "success");
        loadUserTable();
        updateDashboardCounts();
    } catch (error) {
        showToast("Failed to delete user. Check permissions.", "error");
    }
}

// --- Enhanced Filter Logic (Manage Users) ---
['userSearch', 'roleFilter', 'yearFilter', 'classFilter', 'batchFilter'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
    document.getElementById(id).addEventListener('input', applyFilters);
});

function applyFilters() {
    const term = document.getElementById('userSearch').value.toLowerCase();
    const role = document.getElementById('roleFilter').value;
    const year = document.getElementById('yearFilter').value;
    const cls = document.getElementById('classFilter').value;
    const batch = document.getElementById('batchFilter').value;

    // Toggle batch filter visibility
    document.getElementById('batchFilter').style.display = (cls === 'MCA') ? 'inline-block' : 'none';
    if(cls !== 'MCA') document.getElementById('batchFilter').value = 'all';

    const filtered = allUsersData.filter(user => {
        const matchesSearch = (user.name || '').toLowerCase().includes(term) || (user.email || '').toLowerCase().includes(term);
        const matchesRole = role === 'all' || user.role === role;
        const matchesYear = year === 'all' || user.year === year;
        const matchesClass = cls === 'all' || user.class === cls;
        const matchesBatch = batch === 'all' || user.batch === batch || user.class !== 'MCA';
        
        return matchesSearch && matchesRole && matchesYear && matchesClass && matchesBatch;
    });
    renderUsers(filtered);
}

// CSV Export
document.getElementById('exportCsvBtn').addEventListener('click', () => {
    if(allUsersData.length === 0) {
        showToast("No data available to export.", "warning");
        return;
    }
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Role,Name,Email,DOB,Class,Year,Batch,Subject,StaffId,RollNo\n";
    allUsersData.forEach(user => {
        let row = [
            user.role || '', user.name || '', user.email || '', user.dob || '',
            user.class || '', user.year || '', user.batch || '', user.subject || '', user.staffId || '', user.rollNo || ''
        ].join(",");
        csvContent += row + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "academic_users_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV Exported Successfully", "success");
});

// CSV Import
document.getElementById('importCsvBtn').addEventListener('click', () => {
    document.getElementById('csvFileInput').click();
});

document.getElementById('csvFileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    toggleBtnLoader('importCsvBtn', true);

    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result;
        const rows = text.split('\n').map(row => row.trim()).filter(row => row.length > 0);
        let successCount = 0, errorCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].split(',').map(col => col.trim());
            if (cols.length < 4) continue;
            
            const role = cols[0].toLowerCase();
            const name = cols[1];
            const email = cols[2];
            let dob = cols[3]; 
            
            const dateMatch = dob.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
            if (dateMatch) dob = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`; 
            const password = dob.replace(/[-/]/g, ''); 
            
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const uid = userCredential.user.uid;
                const userData = { uid, name, email, role, dob, createdAt: serverTimestamp() };
                
                if (role === 'student') {
                    const className = cols[4] || 'MCA';
                    const year = cols[5] || '1 year';
                    const batch = cols[6] || '';
                    const rollNo = cols[9] || cols[8] || ''; // Adjust based on old/new CSV layout
                    
                    await setDoc(doc(db, "students", uid), { name, email, rollNo, class: className, year, batch, department: "Academic" });
                    userData.class = className; userData.year = year; userData.batch = batch;
                } else if (role === 'faculty') {
                    userData.subject = cols[7] || cols[6] || '';
                    userData.staffId = cols[8] || cols[7] || '';
                }
                
                await setDoc(doc(db, "users", uid), userData);
                successCount++;
            } catch(err) { errorCount++; }
        }
        
        toggleBtnLoader('importCsvBtn', false);
        if(errorCount === 0) showToast(`Import complete! ${successCount} users added.`, "success");
        else showToast(`Import finished: ${successCount} added, ${errorCount} failed.`, "warning");
        
        loadUserTable();
        updateDashboardCounts();
    };
    reader.readAsText(file);
    this.value = ''; 
});

// --- Dynamic Form Display Logic ---
const userRoleSelect = document.getElementById('userRole');
const studentFields = document.getElementById('studentFields');
const facultyFields = document.getElementById('facultyFields');

userRoleSelect.addEventListener('change', () => {
    const role = userRoleSelect.value;
    studentFields.style.display = (role === 'student') ? 'block' : 'none';
    facultyFields.style.display = (role === 'faculty') ? 'block' : 'none';
});

document.getElementById('studentClassSelect').addEventListener('change', (e) => {
    document.getElementById('studentBatchGroup').style.display = (e.target.value === 'MCA') ? 'block' : 'none';
});

document.getElementById('editStudentClass').addEventListener('change', (e) => {
    document.getElementById('editStudentBatchGroup').style.display = (e.target.value === 'MCA') ? 'block' : 'none';
});

document.getElementById('ttClass').addEventListener('change', (e) => {
    document.getElementById('ttBatchContainer').style.display = (e.target.value === 'MCA') ? 'flex' : 'none';
});

document.getElementById('showAddUserBtn').onclick = () => document.getElementById('addUserOverlay').style.display = 'flex';
document.getElementById('closeFormBtn').onclick = () => { document.getElementById('addUserOverlay').style.display = 'none'; document.getElementById('userForm').reset(); document.getElementById('studentBatchGroup').style.display = 'block';};
document.getElementById('closeEditFormBtn').onclick = () => document.getElementById('editUserOverlay').style.display = 'none';

function openEditModal(userId) {
    const user = allUsersData.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserRole').value = user.role;
    document.getElementById('editUserName').value = user.name || '';
    document.getElementById('editUserEmail').value = user.email || '';

    const editStudentFields = document.getElementById('editStudentFields');
    const editFacultyFields = document.getElementById('editFacultyFields');

    if (user.role === 'student') {
        editStudentFields.style.display = 'flex';
        editFacultyFields.style.display = 'none';
        
        document.getElementById('editStudentClass').value = user.class || 'MCA';
        document.getElementById('editStudentYear').value = user.year || '1 year';
        
        if (user.class === 'MCA') {
            document.getElementById('editStudentBatchGroup').style.display = 'block';
            document.getElementById('editStudentBatch').value = user.batch || '1';
        } else {
            document.getElementById('editStudentBatchGroup').style.display = 'none';
        }
        
    } else if (user.role === 'faculty') {
        editStudentFields.style.display = 'none';
        editFacultyFields.style.display = 'block';
        document.getElementById('editFacultySubject').value = user.subject || '';
    } else {
        editStudentFields.style.display = 'none';
        editFacultyFields.style.display = 'none';
    }
    document.getElementById('editUserOverlay').style.display = 'flex';
}

// Add User Submit
document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleBtnLoader('submitAddUserBtn', true);

    const role = userRoleSelect.value;
    const name = document.getElementById('userName').value;
    const email = document.getElementById('userEmail').value;
    const dob = document.getElementById('userDob').value;
    const password = dob.replace(/-/g, '');

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        const userData = { uid, name, email, role, dob, createdAt: serverTimestamp() };

        if (role === 'student') {
            const rollNo = document.getElementById('studentRoll').value;
            const className = document.getElementById('studentClassSelect').value;
            const year = document.getElementById('studentYearSelect').value;
            const batch = (className === 'MCA') ? document.getElementById('studentBatchSelect').value : '';
            
            await setDoc(doc(db, "students", uid), { name, email, rollNo, class: className, year, batch, department: "Academic" });
            userData.class = className; userData.year = year; userData.batch = batch;
        } else if (role === 'faculty') {
            userData.staffId = document.getElementById('facultyStaffId').value;
            userData.subject = document.getElementById('facultySubject').value;
        }

        await setDoc(doc(db, "users", uid), userData);
        showToast("User successfully created!", "success");
        document.getElementById('addUserOverlay').style.display = 'none';
        document.getElementById('userForm').reset();
        loadUserTable();
    } catch (error) {
        showToast("Error: " + error.message, "error");
    } finally {
        toggleBtnLoader('submitAddUserBtn', false);
    }
});

// Edit User Submit
document.getElementById('editUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    toggleBtnLoader('submitEditUserBtn', true);

    const userId = document.getElementById('editUserId').value;
    const role = document.getElementById('editUserRole').value;
    const name = document.getElementById('editUserName').value;

    try {
        const updateData = { name: name };
        if (role === 'student') {
            updateData.class = document.getElementById('editStudentClass').value;
            updateData.year = document.getElementById('editStudentYear').value;
            updateData.batch = (updateData.class === 'MCA') ? document.getElementById('editStudentBatch').value : '';
            
            await setDoc(doc(db, "students", userId), { name: name, class: updateData.class, year: updateData.year, batch: updateData.batch }, { merge: true });
        } else if (role === 'faculty') {
            updateData.subject = document.getElementById('editFacultySubject').value;
        }

        await updateDoc(doc(db, "users", userId), updateData);
        showToast("User profile updated!", "success");
        document.getElementById('editUserOverlay').style.display = 'none';
        loadUserTable();
    } catch (error) {
        showToast("Update failed: " + error.message, "error");
    } finally {
        toggleBtnLoader('submitEditUserBtn', false);
    }
});


// --- NEW: COMPREHENSIVE ATTENDANCE REPORTS (Admin) ---

// Setup click listeners for report filter cards
document.querySelectorAll('.report-cards').forEach(container => {
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.report-card');
        if (!card) return;
        
        // Active Toggle
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
                // Reset batch visually
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
            getDocs(collection(db, "attendance"))
        ]);
        
        reportStudents = [];
        stuSnap.forEach(doc => { reportStudents.push({ id: doc.id, ...doc.data() }); });
        
        reportAttendance = [];
        reportSubjectsSet.clear();
        attSnap.forEach(doc => {
            const data = doc.data();
            reportAttendance.push(data);
            if(data.subject) reportSubjectsSet.add(data.subject);
        });
        
        // Render Dynamic Subject Cards based on existing database logs
        const subContainer = document.getElementById('rc-subject');
        subContainer.innerHTML = '<div class="report-card active" data-val="all">All Subjects</div>';
        reportSubjectsSet.forEach(sub => {
            subContainer.innerHTML += `<div class="report-card" data-val="${sub}">${sub}</div>`;
        });
        
        // Restore active state if repSubject was set previously and exists
        if (repSubject !== 'all' && reportSubjectsSet.has(repSubject)) {
            document.querySelector('#rc-subject .report-card[data-val="all"]').classList.remove('active');
            const targetCard = document.querySelector(`#rc-subject .report-card[data-val="${repSubject}"]`);
            if(targetCard) targetCard.classList.add('active');
        } else {
            repSubject = 'all'; // Default fallback
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
    
    // Group attendance: key -> {studentId, subject, p, a, o, t}
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
        
        // Apply Global Filters
        if (repYear !== 'all' && student.year !== repYear) continue;
        if (repClass !== 'all' && student.class !== repClass) continue;
        if (repClass === 'MCA' && repBatch !== 'all' && student.batch !== repBatch) continue;
        if (repSubject !== 'all' && data.subject !== repSubject) continue;
        
        // Percentage & Eligibility Logic
        const effectiveP = data.p + data.o;
        const percentage = data.t > 0 ? ((effectiveP / data.t) * 100).toFixed(1) : 0;
        
        let currentElig = '';
        let eligHtml = '';
        let pctColor = '#ef4444'; // Red
        
        if (percentage >= 75) {
            currentElig = 'Eligible';
            eligHtml = '<span class="badge success"><i class="fas fa-check"></i> Eligible</span>';
            pctColor = '#10b981'; // Green
        }
        else if (percentage >= 65) {
            currentElig = 'Condonation';
            eligHtml = '<span class="badge warning"><i class="fas fa-exclamation-triangle"></i> Condonation</span>';
            pctColor = '#f59e0b'; // Orange
        }
        else {
            currentElig = 'Not Eligible';
            eligHtml = '<span class="badge danger"><i class="fas fa-times"></i> Not Eligible</span>';
        }

        // Add Eligibility Filter check here
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


// --- Timetable Section ---
const ttBody = document.getElementById('timetableBody');
const ttDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

async function fetchAllTimetables() {
    try {
        const snap = await getDocs(collection(db, "timetables"));
        allTimetablesCache = {};
        snap.forEach(doc => {
            allTimetablesCache[doc.id] = doc.data();
        });
    } catch (e) {
        console.error("Error fetching timetables for conflict resolution", e);
    }
}

function initTimetableGrid() {
    ttBody.innerHTML = "";
    let optionsHtml = `<option value="">- Free -</option>`;
    facultySubjects.forEach(sub => { optionsHtml += `<option value="${sub}">${sub}</option>`; });
    
    let weekendOptionsHtml = `<div style="display:flex; flex-direction:column; gap:8px; align-items:flex-start;">
                                <label style="cursor:pointer;"><input type="radio" name="weekendSub" value="None" checked> None</label>`;

    ttDays.forEach(day => {
        let tr = document.createElement('tr');
        tr.innerHTML = `<td><strong style="color:#1e293b;">${day}</strong></td>`;
        for(let i=1; i<=6; i++) {
            tr.innerHTML += `<td><select class="tt-input" data-day="${day}" data-period="${i}">${optionsHtml}</select></td>`;
        }
        
        weekendOptionsHtml += `<label style="cursor:pointer;"><input type="radio" name="weekendSub" value="${day}"> ${day}</label>`;
        
        if (day === "Monday") {
            tr.innerHTML += `<td rowspan="5" style="background-color: #f8fafc; border-left: 1px solid #e2e8f0; vertical-align: top;"></td>`;
        }
        ttBody.appendChild(tr);
    });
    
    weekendOptionsHtml += `</div>`;
    if(ttBody.rows.length > 0) {
        ttBody.rows[0].cells[7].innerHTML = weekendOptionsHtml;
    }

    // Real-time Conflict Resolution Listener
    document.querySelectorAll('.tt-input').forEach(select => {
        select.addEventListener('change', function() {
            const subject = this.value;
            if (!subject || subject === "-") return;
            
            const day = this.dataset.day;
            const period = this.dataset.period;
            
            const year = document.getElementById('ttYear').value;
            const cls = document.getElementById('ttClass').value;
            
            if (!year || !cls) {
                showToast("Please select Year and Class Section first to validate schedule.", "warning");
                this.value = "";
                return;
            }
            
            let currentClassId = `${cls}_${year.replace(' ', '_')}`;
            if (cls === 'MCA') {
                const batchVal = document.querySelector('input[name="ttBatch"]:checked').value;
                currentClassId += `_B${batchVal}`;
            }
            
            for (const [id, data] of Object.entries(allTimetablesCache)) {
                if (id !== currentClassId && data.schedule && data.schedule[day]) {
                    if (data.schedule[day][`P${period}`] === subject) {
                        const bInfo = data.batch ? ` Batch ${data.batch}` : '';
                        showToast(`Conflict: ${subject} is already teaching ${data.class} (${data.year}${bInfo}) at this time.`, "error");
                        this.value = ""; // Revert to empty
                        return;
                    }
                }
            }
        });
    });
}

document.getElementById('loadTtBtn').onclick = async () => {
    const year = document.getElementById('ttYear').value;
    const cls = document.getElementById('ttClass').value;
    
    if(!year || !cls) { showToast("Select Academic Year and Class Section first.", "warning"); return; }
    
    toggleBtnLoader('loadTtBtn', true);
    await fetchAllTimetables(); 

    let className = `${cls}_${year.replace(' ', '_')}`;
    if (cls === 'MCA') {
        const batchVal = document.querySelector('input[name="ttBatch"]:checked').value;
        className += `_B${batchVal}`;
    }
    
    try {
        const docSnap = await getDoc(doc(db, "timetables", className));
        if(docSnap.exists()) {
            const data = docSnap.data();
            const schedule = data.schedule;
            
            initTimetableGrid(); 
            
            ttDays.forEach(day => {
                for(let i=1; i<=6; i++) {
                    const select = document.querySelector(`.tt-input[data-day="${day}"][data-period="${i}"]`);
                    select.value = (schedule[day] && schedule[day][`P${i}`] && schedule[day][`P${i}`] !== "-") ? schedule[day][`P${i}`] : "";
                }
            });
            
            const weekendSub = data.weekendSubstitute || "None";
            const radioToSelect = document.querySelector(`input[name="weekendSub"][value="${weekendSub}"]`);
            if(radioToSelect) radioToSelect.checked = true;
            
            showToast("Schedule loaded.", "success");
        } else {
            initTimetableGrid(); 
            showToast("No existing schedule found for this selection.", "warning");
        }
    } catch(e) { 
        showToast("Failed to fetch timetable.", "error");
    } finally {
        toggleBtnLoader('loadTtBtn', false);
    }
};

document.getElementById('saveTtBtn').onclick = async () => {
    const year = document.getElementById('ttYear').value;
    const cls = document.getElementById('ttClass').value;
    
    if(!year || !cls) { showToast("Select Academic Year and Class before saving.", "warning"); return; }
    
    toggleBtnLoader('saveTtBtn', true);
    await fetchAllTimetables(); 

    let className = `${cls}_${year.replace(' ', '_')}`;
    let batchVal = '';
    if (cls === 'MCA') {
        batchVal = document.querySelector('input[name="ttBatch"]:checked').value;
        className += `_B${batchVal}`;
    }

    const schedule = {};
    let hasConflict = false;
    
    ttDays.forEach(day => {
        schedule[day] = {};
        for(let i=1; i<=6; i++) {
            const val = document.querySelector(`.tt-input[data-day="${day}"][data-period="${i}"]`).value;
            
            if (val && val !== "-") {
                for (const [id, data] of Object.entries(allTimetablesCache)) {
                    if (id !== className && data.schedule && data.schedule[day]) {
                        if (data.schedule[day][`P${i}`] === val) {
                            const bInfo = data.batch ? ` Batch ${data.batch}` : '';
                            showToast(`Conflict on ${day} P${i}: ${val} is already assigned to ${data.class} (${data.year}${bInfo})`, "error");
                            hasConflict = true;
                        }
                    }
                }
            }
            schedule[day][`P${i}`] = val || "-";
        }
    });
    
    if (hasConflict) {
        toggleBtnLoader('saveTtBtn', false);
        return; 
    }
    
    const weekendSubSelected = document.querySelector('input[name="weekendSub"]:checked').value;

    try {
        await setDoc(doc(db, "timetables", className), { 
            year, 
            class: cls, 
            batch: batchVal,
            schedule, 
            weekendSubstitute: weekendSubSelected,
            updatedAt: serverTimestamp() 
        });
        showToast("Timetable successfully compiled and saved!", "success");
        await fetchAllTimetables(); 
    } catch(e) { 
        showToast("Failed to save timetable.", "error");
    } finally {
        toggleBtnLoader('saveTtBtn', false);
    }
};

// Navigation
document.querySelectorAll('.nav-links li').forEach(link => {
    link.addEventListener('click', async () => {
        document.querySelectorAll('.content-section, .nav-links li').forEach(el => el.classList.remove('active'));
        link.classList.add('active');
        document.getElementById(link.dataset.target).classList.add('active');
        document.getElementById('pageTitle').innerText = link.innerText;

        if (link.dataset.target === 'academic-structure') {
            await fetchAllTimetables();
        } else if (link.dataset.target === 'attendance-reports') {
            await loadReportData();
        }
    });
});

document.getElementById('logoutBtn').onclick = () => {
    signOut(auth).then(() => { localStorage.clear(); window.location.href = 'index.html'; });
};

initTimetableGrid();
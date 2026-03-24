import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBGrWKf4qrwrq4G9YYOVUbygHgjiqsdIEk",
  authDomain: "bahubali-529ba.firebaseapp.com",
  projectId: "bahubali-529ba",
  storageBucket: "bahubali-529ba.firebasestorage.app",
  messagingSenderId: "535615132075",
  appId: "1:535615132075:web:cc9acece681f444b6882ee",
  measurementId: "G-RWE7MKGN7J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loginForm = document.getElementById("loginForm");
const errorDisplay = document.getElementById("errorMessage");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value;
  let password = document.getElementById("password").value;

  // UPDATED: Automatically strip hyphens if the user enters their DOB with hyphens 
  // (e.g., YYYY-MM-DD becomes YYYYMMDD) to match the database logic without breaking normal passwords.
  if (/^\d{4}-\d{2}-\d{2}$/.test(password)) {
      password = password.replace(/-/g, '');
  }

  // Reset UI
  errorDisplay.style.display = "none";

  try {
    // 1. Authenticate User
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Fetch User Role from Firestore (Matches register.js logic)
    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (userDoc.exists()) {
      const userData = userDoc.data();
      const role = userData.role;

      // Store session data
      localStorage.setItem('userRole', role);
      localStorage.setItem('userName', userData.name || userData.email); // Fallback to email if name is missing

      // 3. Role-Based Redirection
      if (role === "student") window.location.href = "student.html";
      else if (role === "faculty") window.location.href = "faculty.html";
      else if (role === "admin") window.location.href = "admin.html";
      else alert("Role not recognized!");
      
    } else {
      errorDisplay.innerText = "User profile not found in database.";
      errorDisplay.style.display = "block";
    }
  } catch (error) {
    console.error("Login Error:", error.code);
    errorDisplay.innerText = "Invalid email or password.";
    errorDisplay.style.display = "block";
  }
});
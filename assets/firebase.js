import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDa5jAhFEuuJWRbkHROwcn4hNdmxnS8rPY",
  authDomain: "hadakari-crm-system.firebaseapp.com",
  projectId: "hadakari-crm-system",
  storageBucket: "hadakari-crm-system.firebasestorage.app",
  messagingSenderId: "390638062115",
  appId: "1:390638062115:web:39f81f30253c85b6567f96"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export { firebaseConfig };

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
};
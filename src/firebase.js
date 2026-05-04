// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 將下方的 config 替換為你在 Firebase Console 取得的資料
const firebaseConfig = {
  apiKey: "AIzaSyCvQZ0I3YCT7OPqZKqsyOoaijVd50LnkLM",
  authDomain: "accounts-book-77263.firebaseapp.com",
  projectId: "accounts-book-77263",
  storageBucket: "accounts-book-77263.firebasestorage.app",
  messagingSenderId: "348814513931",
  appId: "1:348814513931:web:0ab07eb74e4020662ef40e",
  measurementId: "G-DQZVEPEFJ9"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 匯出 Firestore 資料庫實體，讓其他元件可以使用
export const db = getFirestore(app);

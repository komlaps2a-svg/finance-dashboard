// ==========================================
// 1. SISTEM AUTO-UPDATE & SMART CACHE BUSTER
// ==========================================
const APP_VERSION = '28.9'; 

function checkAppVersion() {
    const savedVersion = localStorage.getItem('finance_app_version');
    if (savedVersion !== APP_VERSION) {
        localStorage.setItem('finance_app_version', APP_VERSION);
        if (navigator.onLine) {
            const updateScreen = document.getElementById('updateScreen');
            if (updateScreen) {
                updateScreen.style.display = 'flex';
                setTimeout(() => { window.location.reload(true); }, 1500);
            }
        }
    }
}
checkAppVersion();

// ==========================================
// 2. VARIABEL GLOBAL & INISIALISASI
// ==========================================
let sbClient = null;
let db = []; 
let pendingSync = JSON.parse(localStorage.getItem('finance_pending_sync')) || []; 
let currentUser = null; 

let legacyLoginFlag = localStorage.getItem('finance_was_logged_in') === 'true';
if (legacyLoginFlag && !localStorage.getItem('finance_app_mode')) {
    localStorage.setItem('finance_app_mode', 'CLOUD');
}
let APP_MODE = localStorage.getItem('finance_app_mode') || 'GUEST';

let activeWallet = 'harian'; 
let currentTimeFilter = 365; 
let rawAmount = 0;
let pieChart, barChart, lineChart; 
let pendingTxCallback = null;
let aiMessages = []; 
let aiCurrentMsgIdx = 0; 
let aiCarouselInterval = null; 
let realTimeSubscription = null;
let generatedOTP = "";
let otpExpiryTime = 0;

const defaultProfile = { 
    name: 'Guest', pin: '', txPin: '',
    photo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzFlMjliYiI+PHBhdGggZD0iTTEyIDJhNSA1IDAgMSAwIDUgNSBNMTIgMTRhNyA3IDAgMCAwLTcgN3YxSDE5di0xYTcgNyAwIDAgMC03LTdaIi8+PC9zdmc+', 
    joinDate: new Date().toISOString(), birthDate: '', gender: 'Rahasia', googleLinked: false, googleEmail: ''
};

let profile = JSON.parse(localStorage.getItem('user_profile_secure_v2'));

if (!profile) {
    profile = { ...defaultProfile }; 
    localStorage.setItem('user_profile_secure_v2', JSON.stringify(profile));
}

const svgs = {
    makan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    transport: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="7" cy="16" r="1"/><circle cx="17" cy="16" r="1"/><path d="M14 11V7a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4"/></svg>`,
    uang: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
    atm: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h12M6 12h2M10 12h2M14 12h2M6 16h6"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    pinjam: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3v3m-4-3v3M7 3v3m14 8H3m18 4H3m2-14h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
};
const categories = { masuk: ['Gaji', 'Top-Up', 'Bonus', 'Usaha'], keluar: ['Makan', 'Transport', 'Belanja', 'Tagihan'] };

function getDynamicColor(categoryStr, type) {
    if (categoryStr === 'Pindah Tabungan') return '#f59e0b';
    if (categoryStr === 'Dari Tabungan') return '#10b981';
    if (categoryStr === 'Dipinjam') return '#a855f7';
    if (type === 'keluar') return '#ef4444';
    const inColors = { 'Top-Up': '#3b82f6', 'Gaji': '#10b981', 'Bonus': '#06b6d4', 'Usaha': '#8b5cf6', 'Lunas Pinjaman': '#10b981' };
    if (inColors[categoryStr]) return inColors[categoryStr];
    let hash = 0; for(let i = 0; i < categoryStr.length; i++) hash = categoryStr.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 70%, 55%)`; 
}

// ==========================================
// 3. STORAGE ENGINE (LOKAL & KRIPTOGRAFI)
// ==========================================
const SECRET_KEY = "F1n4nc3_App_S3cur3_K3y_99";

function getDBKey() {
    return APP_MODE === 'CLOUD' ? 'finance_cloud_db_secure' : 'finance_guest_db_secure';
}

function saveLocalDB(dataToSave) {
    const dbKey = getDBKey();
    try {
        if (typeof CryptoJS !== 'undefined') {
            const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(dataToSave), SECRET_KEY).toString();
            localStorage.setItem(dbKey, ciphertext);
        } else {
            localStorage.setItem(dbKey + '_fallback', JSON.stringify(dataToSave));
        }
    } catch(e) { console.warn("Gagal simpan lokal:", e); }
}

function loadLocalDB() {
    const dbKey = getDBKey();
    let data = [];
    try {
        const ciphertext = localStorage.getItem(dbKey);
        if (ciphertext) {
            if (typeof CryptoJS === 'undefined') {
                document.body.innerHTML = `
                    <div style="padding: 30px; text-align: center; margin-top: 50px; font-family: 'Inter', sans-serif;">
                        <h2 style="color: #ef4444; margin-bottom: 10px; font-weight: 900;">Sistem Keamanan Terkunci</h2>
                        <p style="color: #64748b; font-size: 14px; line-height: 1.6; font-weight: 600;">Mesin kriptografi gagal dimuat dari server karena tidak ada jaringan. Demi mencegah kehilangan data (saldo mereset ke 0), aplikasi membekukan diri. Silakan cari koneksi internet sesaat, lalu muat ulang halaman.</p>
                    </div>
                `;
                throw new Error("CryptoJS offline. Eksekusi dihentikan mutlak.");
            }
            data = JSON.parse(CryptoJS.AES.decrypt(ciphertext, SECRET_KEY).toString(CryptoJS.enc.Utf8)); 
        } else {
            const fallback = localStorage.getItem(dbKey + '_fallback');
            if (fallback) data = JSON.parse(fallback);
        }
    } catch (e) { 
        console.error("Kegagalan Database Lokal:", e); 
        if(e.message.includes("CryptoJS offline")) return null;
    }
    return Array.isArray(data) ? data : [];
}

async function hashPIN(pin) {
    if (!pin) return '';
    try {
        if (window.crypto && window.crypto.subtle && window.isSecureContext) {
            const msgBuffer = new TextEncoder().encode(pin);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } else if (typeof CryptoJS !== 'undefined') {
            return CryptoJS.SHA256(pin).toString(CryptoJS.enc.Hex);
        } else {
            return btoa(pin); 
        }
    } catch (error) { return btoa(pin); }
}

function saveProfileLocal() {
    localStorage.setItem('user_profile_secure_v2', JSON.stringify(profile));
}

// ==========================================
// 4. BOOTING LOCAL-FIRST
// ==========================================
function bootApp() {
    if(typeof renderShortcuts === 'function') renderShortcuts(); 
    
    const loadedData = loadLocalDB();
    if (loadedData === null) return; 
    
    db = loadedData; 
    initAppHeader();
    if(typeof updateUI === 'function') updateUI('');

    const netStatus = document.getElementById('networkStatus');
    if (APP_MODE === 'CLOUD') {
        currentUser = { id: 'offline_user', email: profile.googleEmail || 'Cloud User' }; 
        if(netStatus) { netStatus.innerText = navigator.onLine ? "Menyambungkan..." : "Offline Mode (Cloud)"; netStatus.className = navigator.onLine ? "status-sync sync-pending" : "status-sync sync-offline"; }
    } else {
        currentUser = null;
        if(netStatus) { netStatus.innerText = "Offline Mode (Guest)"; netStatus.className = "status-sync sync-offline"; }
    }

    setTimeout(initSupabaseBackground, 500);
}

function forceLogoutToGuest() {
    currentUser = null;
    APP_MODE = 'GUEST';
    localStorage.setItem('finance_app_mode', 'GUEST');
    localStorage.removeItem('finance_was_logged_in');
    
    profile = { ...defaultProfile };
    saveProfileLocal();
    
    localStorage.removeItem('finance_guest_db_secure');
    localStorage.removeItem('finance_guest_db_secure_fallback');
    db = []; 
    
    initAppHeader();
    if(typeof renderShortcuts === 'function') renderShortcuts(); 
    if(typeof updateUI === 'function') updateUI(''); 
    
    showToast("Berhasil Logout. Kembali ke Guest (Nol).", "success");
    closeModal('profileViewModal');
    
    const netStatus = document.getElementById('networkStatus');
    if(netStatus) { netStatus.innerText = navigator.onLine ? "Online Mode (Guest)" : "Offline Mode (Guest)"; netStatus.className = navigator.onLine ? "status-sync sync-online" : "status-sync sync-offline"; }
}

async function initSupabaseBackground() {
    const netStatus = document.getElementById('networkStatus');
    
    if (typeof window.supabase === 'undefined') {
        console.warn("Supabase CDN mati. Aplikasi berjalan murni offline.");
        if(netStatus) { netStatus.innerText = "Offline Mode (Lokal)"; netStatus.className = "status-sync sync-offline"; }
        return;
    }

    const supabaseUrl = 'https://kkbfppuxuwcbapexlqsx.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrYmZwcHV4dXdjYmFwZXhscXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDMwODAsImV4cCI6MjA4NzU3OTA4MH0.pOGHpiR333Ltp2g3BQvV8xSMbdbMeRMHJ3ZgecHDRzM';
    
    if (!sbClient) {
        sbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }

    if (APP_MODE === 'CLOUD' && navigator.onLine) {
        try {
            const sessionPromise = sbClient.auth.getSession();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Koneksi')), 5000));
            
            const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);
            if (error) throw error;

            if (session && session.user) {
                currentUser = session.user;
                if(netStatus) { netStatus.innerText = "Online Mode (Cloud)"; netStatus.className = "status-sync sync-online"; }
                
                fetchUserTransactions(); 
                setupRealtime();
                if (pendingSync.length > 0) processPendingSync();
            } else {
                forceLogoutToGuest();
            }
        } catch(err) {
            console.warn("Koneksi Supabase timeout, masuk mode antrean lokal.", err);
            if(netStatus) { netStatus.innerText = "Server Lambat (Mode Lokal)"; netStatus.className = "status-sync sync-offline"; }
        }
    }

    if (!window.supabaseListenerAdded) {
        window.supabaseListenerAdded = true;
        sbClient.auth.onAuthStateChange(async (event, currentSession) => {
            if (event === 'SIGNED_OUT') {
                forceLogoutToGuest();
            } else if (event === 'SIGNED_IN' && currentSession) {
                currentUser = currentSession.user; 
                APP_MODE = 'CLOUD';
                localStorage.setItem('finance_app_mode', 'CLOUD');
                localStorage.setItem('finance_was_logged_in', 'true');
                
                if(netStatus) { netStatus.innerText = navigator.onLine ? "Online Mode (Cloud)" : "Offline Mode (Cloud)"; netStatus.className = navigator.onLine ? "status-sync sync-online" : "status-sync sync-offline"; }
                
                try {
                    const { data: profileData } = await sbClient.from('profiles').select('data').eq('id', currentUser.id).single();
                    if (profileData && profileData.data) { 
                        profile = { ...profile, ...profileData.data }; 
                    } else { 
                        if(profile.name === 'Guest') profile.name = properTitleCase(currentUser.user_metadata?.full_name) || 'Member'; 
                        profile.photo = currentUser.user_metadata?.avatar_url || profile.photo; 
                        await saveProfileToSupabase(); 
                    }
                } catch(e) { console.warn("Tarik profil dari Cloud terkendala jaringan."); }
                
                profile.googleLinked = true; 
                profile.googleEmail = currentUser.email; 
                saveProfileLocal(); 
                
                db = loadLocalDB(); 
                initAppHeader(); 
                if(typeof renderShortcuts === 'function') renderShortcuts(); 
                fetchUserTransactions(); 
                setupRealtime();
                closeModal('googleAuthModal');
                
                if (navigator.onLine && pendingSync.length > 0) processPendingSync();
            }
        });
    }

    if (typeof window.emailjs !== 'undefined') { window.emailjs.init("qcqCpH81lqwQKw_MG"); }
}

// ==========================================
// 5. AUTO-SYNC & CLOUD FETCH ENGINE
// ==========================================
function savePendingSync() {
    localStorage.setItem('finance_pending_sync', JSON.stringify(pendingSync));
}

async function processPendingSync() {
    if (!navigator.onLine || APP_MODE !== 'CLOUD' || !currentUser || currentUser.id === 'offline_user' || !sbClient || pendingSync.length === 0) return;
    try {
        showToast("Menyinkronkan data offline...", "syncing");
        const payload = pendingSync.map(t => { 
            let newData = { ...t, user_id: currentUser.id }; 
            if(newData.id && String(newData.id).length > 10) delete newData.id; 
            return newData; 
        });
        
        const syncPromise = sbClient.from('transactions').insert(payload);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Sync')), 8000));
        
        const { error } = await Promise.race([syncPromise, timeoutPromise]);
        if (error) throw error;
        
        pendingSync = [];
        savePendingSync();
        showToast("Data offline tersimpan ke Cloud!", "success");
        fetchUserTransactions();
    } catch (error) {
        console.warn("Gagal Auto-Sync, menunggu sesi online berikutnya:", error);
    }
}

async function fetchUserTransactions() {
    if (APP_MODE !== 'CLOUD' || !currentUser || currentUser.id === 'offline_user' || !sbClient) return;
    try {
        if (!navigator.onLine) throw new Error("Offline mode aktif.");
        
        const fetchPromise = sbClient.from('transactions').select('*').eq('user_id', currentUser.id).order('date', { ascending: true });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Supabase Fetch')), 8000));
        
        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
        if (error) throw error;

        const pendingData = localStorage.getItem('pending_guest_data');
        if (pendingData) {
            try {
                const guestDb = JSON.parse(pendingData);
                if (data.length === 0 && guestDb.length > 0) {
                    showToast("Memigrasi data ke Cloud...", "syncing");
                    const payload = guestDb.map(t => { let newData = { ...t, user_id: currentUser.id }; if(newData.id) delete newData.id; return newData; });
                    const { error: insertErr } = await sbClient.from('transactions').insert(payload);
                    if (insertErr) throw insertErr;
                    localStorage.removeItem('pending_guest_data');
                    const { data: newData } = await sbClient.from('transactions').select('*').eq('user_id', currentUser.id).order('date', { ascending: true });
                    db = newData || [];
                } else {
                    localStorage.removeItem('pending_guest_data');
                    db = data;
                }
            } catch (migrationError) { db = data; }
        } else { db = data; }

        saveLocalDB(db); 
        if(typeof updateUI === 'function') updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
    } catch (error) {
        console.warn("Fetch lambat/gagal, memakai memori lokal.");
        db = loadLocalDB(); 
        if(typeof updateUI === 'function') updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
    }
}

function setupRealtime() {
    if (APP_MODE !== 'CLOUD' || !currentUser || currentUser.id === 'offline_user' || !sbClient) return;
    if (realTimeSubscription) sbClient.removeChannel(realTimeSubscription);
    realTimeSubscription = sbClient.channel('custom-all-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${currentUser.id}` }, payload => { 
            fetchUserTransactions(); 
        }).subscribe();
}

// ==========================================
// 6. DETEKSI JARINGAN KETAT & AUTO RECONNECT
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-overlay.active').forEach(el => el.classList.remove('active'));
    setTimeout(() => { if (navigator.onLine && pendingSync.length > 0) processPendingSync(); }, 3000);
});

window.addEventListener('online', () => { 
    const netStatus = document.getElementById('networkStatus');
    if(netStatus) { 
        netStatus.innerText = APP_MODE === 'CLOUD' ? "Menyambungkan Ulang..." : "Online Mode (Guest)"; 
        netStatus.className = APP_MODE === 'CLOUD' ? "status-sync sync-pending" : "status-sync sync-online"; 
    }
    if(APP_MODE === 'CLOUD') {
        if (currentUser && currentUser.id === 'offline_user') {
            initSupabaseBackground();
        } else {
            if (pendingSync.length > 0) { processPendingSync(); } 
            else if (typeof fetchUserTransactions === 'function') { fetchUserTransactions(); }
            if(netStatus) { netStatus.innerText = "Online Mode (Cloud)"; netStatus.className = "status-sync sync-online"; }
        }
    }
});

window.addEventListener('offline', () => { 
    const netStatus = document.getElementById('networkStatus');
    if(netStatus) { 
        netStatus.innerText = pendingSync.length > 0 ? "Offline (Menunggu Sync)" : (APP_MODE === 'CLOUD' ? "Offline Mode (Cloud)" : "Offline Mode (Guest)"); 
        netStatus.className = pendingSync.length > 0 ? "status-sync sync-pending" : "status-sync sync-offline"; 
    }
    showToast("Koneksi terputus. Mode Z-Offline Aktif.", "error");
    if(typeof updateUI === 'function') updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible') { 
        checkAppVersion(); 
        if (navigator.onLine && APP_MODE === 'CLOUD') { 
            const netStatus = document.getElementById('networkStatus');
            if (currentUser && currentUser.id === 'offline_user') {
                if(netStatus) { netStatus.innerText = "Menyambungkan Ulang..."; netStatus.className = "status-sync sync-pending"; }
                initSupabaseBackground();
            } else if (pendingSync.length > 0) {
                processPendingSync();
            }
        } 
    }
});

// ==========================================
// 7. FORMATTER & UTILITY SAKTI
// ==========================================
function formatRp(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); }
function formatRpPendek(num) { let str = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); return str.replace(/\.000$/, '...'); }
function formatDetailDate(iso) { if(!iso) return '-'; const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`; }

// MESIN SMART INITIAL: Dinamis Berbasis Lebar Layar (Viewport)
function formatSmartName(name) {
    if (!name) return name; 
    
    // Jika lebar layar di atas 400px, kembalikan nama utuh.
    if (window.innerWidth > 400) return name;

    // Logika pemotongan HANYA berjalan jika layar sempit (< 400px)
    if (name.length > 12) {
        let words = name.trim().split(/\s+/);
        if (words.length > 1) {
            let lastWord = words.pop(); 
            return words.join(' ') + ' ' + lastWord.charAt(0).toUpperCase() + '.';
        }
    }
    return name;
}

// Pemicu otomatis agar nama menyesuaikan diri saat ukuran layar (viewport) berubah
window.addEventListener('resize', () => {
    const headNameEl = document.getElementById('headName');
    if (headNameEl && typeof profile !== 'undefined') {
        headNameEl.innerText = formatSmartName(profile.name);
    }
});

function showToast(msg, type = 'success') { 
    const box = document.getElementById('toastBox'); 
    if(!box) return; 
    const t = document.createElement('div'); 
    t.className = `toast ${type}`; 
    t.innerHTML = msg; 
    box.appendChild(t); 
    setTimeout(() => t.classList.add('show'), 10); 
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500); 
}

function closeModal(id) { 
    if(id) {
        const el = document.getElementById(id); 
        if(el) el.classList.remove('active'); 
    }
    document.querySelectorAll('.custom-options.open').forEach(e => e.classList.remove('open')); 
}

function properTitleCase(str) { if(!str) return ""; return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase()); }

let confirmAction = null;
function openCustomConfirm(title, desc, action) { 
    document.getElementById('confirmTitle').innerText = title; 
    document.getElementById('confirmDesc').innerHTML = desc; 
    confirmAction = action; 
    document.getElementById('confirmModal').classList.add('active'); 
}
document.getElementById('btnConfirmYes').addEventListener('click', () => { if(confirmAction) confirmAction(); closeModal('confirmModal'); });

// ==========================================
// 8. PROFIL, KEAMANAN PIN & GOOGLE AUTH
// ==========================================
function initAppHeader() { 
    document.getElementById('headName').innerText = formatSmartName(profile.name); 
    document.getElementById('headGender').innerText = profile.gender; 
    document.getElementById('headProfileImg').src = profile.photo; 
}

async function saveProfileToSupabase() { 
    if (APP_MODE !== 'CLOUD' || !currentUser || currentUser.id === 'offline_user' || !navigator.onLine || !sbClient) return; 
    try { 
        const upsertPromise = sbClient.from('profiles').upsert({ id: currentUser.id, data: profile }); 
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Supabase Profile')), 5000));
        await Promise.race([upsertPromise, timeoutPromise]);
    } catch(e) { console.warn("Simpan profil ke Cloud tertunda karena jaringan."); } 
}

function promptTxPin(callback) { 
    pendingTxCallback = callback; 
    const input = document.getElementById('inputTxPin'); input.value = ''; 
    if (!profile.txPin) { 
        document.getElementById('txPinTitle').innerText = "Buat Sandi Transaksi"; 
        document.getElementById('txPinDesc').innerText = "Buat sandi khusus untuk pelunasan."; 
        document.getElementById('btnVerifyTxPin').innerText = "Simpan & Lanjut"; 
    } else { 
        document.getElementById('txPinTitle').innerText = "Sandi Transaksi"; 
        document.getElementById('txPinDesc').innerText = "Masukkan sandi transaksi Anda."; 
        document.getElementById('btnVerifyTxPin').innerText = "Konfirmasi"; 
    } 
    document.getElementById('txPinModal').classList.add('active'); setTimeout(() => input.focus(), 300); 
}

async function verifyTxPin() { 
    const val = document.getElementById('inputTxPin').value; 
    if (val.length < 4) { showToast("Sandi min 4 digit", "error"); return; } 
    const hashedVal = await hashPIN(val); 
    if (!profile.txPin) { 
        profile.txPin = hashedVal; saveProfileLocal(); await saveProfileToSupabase(); showToast("Sandi Dibuat!", "success"); 
    } else { 
        if (hashedVal !== profile.txPin) { showToast("Sandi Salah!", "error"); return; } 
    } 
    closeModal('txPinModal'); if (pendingTxCallback) { pendingTxCallback(); pendingTxCallback = null; } 
}

function openResetTxPinModal() { 
    closeModal('txPinModal'); 
    if (!profile.pin) { showToast("Buat PIN Profil utama dulu.", "error"); return; } 
    const input = document.getElementById('inputResetTxAuthPin'); input.value = ''; 
    document.getElementById('resetTxPinAuthModal').classList.add('active'); setTimeout(() => input.focus(), 300); 
}

async function executeResetTxPin() { 
    const pin = document.getElementById('inputResetTxAuthPin').value; 
    const hashedPin = await hashPIN(pin); 
    if (hashedPin === profile.pin) { 
        profile.txPin = ''; saveProfileLocal(); await saveProfileToSupabase(); showToast("Sandi Direset!"); 
        closeModal('resetTxPinAuthModal'); promptTxPin(pendingTxCallback); 
    } else { showToast("PIN Salah!", "error"); } 
}

document.getElementById('btnRealGoogleLogin').addEventListener('click', async () => { 
    if(typeof window.supabase === 'undefined' || !sbClient || !navigator.onLine) { showToast("Mode Offline. Tidak bisa Login.", "error"); return; }
    if(APP_MODE === 'GUEST' && db.length > 0) localStorage.setItem('pending_guest_data', JSON.stringify(db)); 
    const { error } = await sbClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } }); 
    if (error) showToast("Gagal Login", "error"); 
});

let currentProfileTimeFilter = 0; 

function applyProfileTimeFilter(days, labelText) {
    currentProfileTimeFilter = days;
    document.getElementById('dispProfileTimeFilter').innerText = labelText;
    closeModal(''); 
    renderProfileStats(); 
}

function renderProfileStats() {
    let inHarian = 0, outHarian = 0, inTabungan = 0, outTabungan = 0; 
    const today = new Date(); today.setHours(0,0,0,0);

    db.forEach(t => { 
        if(currentProfileTimeFilter !== 0) { 
            const d = new Date(t.date); d.setHours(0,0,0,0); 
            if(Math.floor(Math.abs(today - d) / 86400000) > currentProfileTimeFilter) return; 
        }

        if (t.wallet === 'harian') {
            if (t.type === 'masuk') inHarian += t.amount; else outHarian += t.amount; 
        } else if (t.wallet === 'tabungan') {
            if (t.type === 'masuk') inTabungan += t.amount; else outTabungan += t.amount; 
        }
    }); 
    
    document.getElementById('viewTotalMasuk').innerText = formatRp(inHarian); 
    document.getElementById('viewTotalKeluar').innerText = formatRp(outHarian); 
    const viewMasukTab = document.getElementById('viewTotalMasukTabungan');
    if (viewMasukTab) viewMasukTab.innerText = formatRp(inTabungan);
    const viewKeluarTab = document.getElementById('viewTotalKeluarTabungan');
    if (viewKeluarTab) viewKeluarTab.innerText = formatRp(outTabungan);
}

function openProfileView() { 
    currentProfileTimeFilter = 0;
    const dispFilter = document.getElementById('dispProfileTimeFilter');
    if(dispFilter) dispFilter.innerText = 'Semua Waktu';
    
    renderProfileStats();
    
    document.getElementById('viewProfileImg').src = profile.photo; 
    document.getElementById('viewProfileName').innerText = profile.name; 
    document.getElementById('viewJoinDate').innerText = "Bergabung: " + formatDetailDate(profile.joinDate); 
    document.getElementById('viewGender').innerText = profile.gender || '-'; 
    document.getElementById('viewBirth').innerText = profile.birthDate || '-'; 
    
    const stat = document.getElementById('viewGoogleStatus'); 
    const btnText = document.getElementById('textGoogleLink'); 
    const btn = document.getElementById('btnGoogleLink'); 
    
    if(APP_MODE === 'CLOUD') { 
        stat.innerHTML = `<span style="color:var(--hijau); font-weight:700;">${profile.googleEmail || (currentUser ? currentUser.email : 'Cloud User')}</span>`; 
        btnText.innerText = "Logout"; btn.style.borderColor = "var(--merah)"; btn.style.color = "var(--merah)"; 
        
        btn.onclick = () => {
            openCustomConfirm("Logout Akun", "Logout ke mode Guest? Data Cloud tetap aman di server.", async () => { 
                if(sbClient && navigator.onLine) {
                    await sbClient.auth.signOut(); 
                } else { 
                    if(typeof forceLogoutToGuest === 'function') forceLogoutToGuest();
                }
            }); 
        };
    } else { 
        stat.innerText = "Tidak Terhubung"; stat.style.color = "var(--text-muted)"; 
        btnText.innerText = "Hubungkan"; btn.style.borderColor = "#4285F4"; btn.style.color = "#4285F4"; 
        btn.onclick = openGoogleAuthModal; 
    } 
    document.getElementById('profileViewModal').classList.add('active'); 
}

function openGoogleAuthModal() { document.getElementById('googleAuthModal').classList.add('active'); }
function requestProfileEdit() { if(profile.pin && profile.pin !== '') { closeModal('profileViewModal'); document.getElementById('inputAuthPin').value = ''; document.getElementById('pinAuthModal').classList.add('active'); } else { openProfileEdit(); } }
function initResetSequence() { if (!profile.pin || profile.pin.trim() === '') { showToast("Buat PIN di Edit Profil.", "error"); return; } closeModal('profileViewModal'); document.getElementById('inputResetPin').value = ''; document.getElementById('resetPinModal').classList.add('active'); }

async function verifyPinAuth(actionType) { 
    const inputVal = document.getElementById(actionType === 'edit' ? 'inputAuthPin' : 'inputResetPin').value; 
    const hashedInput = await hashPIN(inputVal); 
    if (hashedInput === profile.pin) { 
        if (actionType === 'edit') { closeModal('pinAuthModal'); openProfileEdit(); } 
        else if (actionType === 'reset') { closeModal('resetPinModal'); document.getElementById('resetConfirmModal').classList.add('active'); } 
    } else { showToast("PIN Salah!", "error"); } 
}

function openProfileEdit() { document.getElementById('editProfileImg').src = profile.photo; document.getElementById('editName').value = profile.name !== 'Guest' ? profile.name : ''; selectGender(profile.gender); document.getElementById('editBirth').value = profile.birthDate; document.getElementById('editPin').value = ''; document.getElementById('profileEditModal').classList.add('active'); }

document.getElementById('profileUploader').addEventListener('change', async function(e) { 
    const f = e.target.files[0]; if(!f) return; 
    showToast("Memproses foto...", "syncing"); 
    const reader = new FileReader(); 
    reader.onload = function(evt) { 
        const img = new Image(); 
        img.onload = async function() { 
            const canvas = document.createElement('canvas'); 
            const MAX_WIDTH = 400; const MAX_HEIGHT = 400; 
            let width = img.width; let height = img.height; 
            if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } 
            else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } } 
            canvas.width = width; canvas.height = height; 
            const ctx = canvas.getContext('2d'); 
            ctx.drawImage(img, 0, 0, width, height); 

            if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient) {
                showToast("Mengunggah ke Cloud Storage...", "syncing");
                canvas.toBlob(async (blob) => {
                    const fileName = `${currentUser.id}_profile.jpg`;
                    
                    const { data, error } = await sbClient.storage.from('avatars').upload(fileName, blob, { 
                        upsert: true, 
                        contentType: 'image/jpeg' 
                    });

                    if (error) {
                        showToast("Gagal unggah ke Cloud", "error");
                        console.error(error);
                    } else {
                        const { data: publicUrlData } = sbClient.storage.from('avatars').getPublicUrl(fileName);
                        profile.photo = publicUrlData.publicUrl + '?t=' + new Date().getTime(); 
                        
                        document.getElementById('editProfileImg').src = profile.photo; 
                        saveProfileLocal();
                        saveProfileToSupabase(); 
                        showToast("Foto sukses masuk Cloud!", "success");
                    }
                }, 'image/jpeg', 0.8);
            } else {
                profile.photo = canvas.toDataURL('image/jpeg', 0.6); 
                document.getElementById('editProfileImg').src = profile.photo; 
                saveProfileLocal();
                showToast("Foto tersimpan di memori HP (Lokal)", "success");
            }
        }; 
        img.src = evt.target.result; 
    }; 
    reader.readAsDataURL(f); 
});

document.getElementById('editBirth').addEventListener('input', function(e) { 
    let v = e.target.value.replace(/\D/g, ''); if (v.length > 8) v = v.substring(0, 8); let hari = v.substring(0, 2); let bulan = v.substring(2, 4); let tahun = v.substring(4, 8); 
    if (hari.length === 2 && parseInt(hari) > 31) hari = '31'; if (hari.length === 2 && parseInt(hari) === 0) hari = '01'; if (bulan.length === 2 && parseInt(bulan) > 12) bulan = '12'; if (bulan.length === 2 && parseInt(bulan) === 0) bulan = '01'; 
    let finalFormat = hari; if (v.length >= 3) finalFormat += '/' + bulan; if (v.length >= 5) finalFormat += '/' + tahun; e.target.value = finalFormat; 
});

async function saveProfileData() { 
    profile.name = properTitleCase(document.getElementById('editName').value.trim()) || 'Guest'; 
    profile.gender = document.getElementById('editGender').value; 
    profile.birthDate = document.getElementById('editBirth').value; 
    const rawPin = document.getElementById('editPin').value; 
    if (rawPin && rawPin.trim() !== '') { profile.pin = await hashPIN(rawPin); } 
    saveProfileLocal(); initAppHeader(); closeModal('profileEditModal'); showToast("Profil Disimpan"); saveProfileToSupabase(); 
}

async function executeFactoryReset() { 
    showToast("Memulai format...", "syncing"); 
    db = [];
    const dbKey = getDBKey();
    localStorage.removeItem(dbKey);
    localStorage.removeItem(dbKey + '_fallback');
    
    try { 
        if (APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient) { 
            const delPromise = sbClient.from('transactions').delete().eq('user_id', currentUser.id); 
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
            const { error } = await Promise.race([delPromise, timeout]);
            if (error) throw error; 
        }
        showToast("Database musnah.", "success"); 
    } catch (e) { showToast("Direset Lokal Saja.", "error"); } 
    closeModal('resetConfirmModal'); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
}

// ==========================================
// 9. KONTROL UI MURNI
// ==========================================
function switchWallet(type) { activeWallet = type; document.getElementById('walletSwitchContainer').setAttribute('data-active', type); renderShortcuts(); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); }
function toggleCustomSelect(id) { const box = document.getElementById(id); const isOpen = box.classList.contains('open'); document.querySelectorAll('.custom-options.open').forEach(el => el.classList.remove('open')); if(!isOpen) box.classList.add('open'); }
function applyTimeFilter(days, labelText) { currentTimeFilter = days; document.getElementById('dispTimeFilter').innerText = labelText; closeModal(''); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); }
function selectGender(val) { document.getElementById('editGender').value = val; document.getElementById('dispGenderVal').innerText = val; closeModal(''); }
function selectCategory(val) { document.getElementById('tx-category').value = val; document.getElementById('dispTxCat').innerText = val; closeModal(''); }
function toggleSection(sec, icn) { document.getElementById(sec).classList.toggle('hidden'); document.getElementById(icn).classList.toggle('rotated'); }

function openCSVModal() { if(db.length === 0) { showToast("Data kosong.", "error"); return; } document.getElementById('csvExportModal').classList.add('active'); }
function executeCSVExport() { 
    closeModal('csvExportModal'); let csv = "Tanggal,Dompet,Tipe,Kategori,Deskripsi,Peminjam,Nominal,Status\n"; 
    const today = new Date(); today.setHours(0,0,0,0);
    const filteredData = db.filter(tx => { if(tx.wallet !== activeWallet) return false; if(currentTimeFilter !== 0) { const d = new Date(tx.date); d.setHours(0,0,0,0); if(Math.floor(Math.abs(today - d) / 86400000) > currentTimeFilter) return false; } return true; });
    if(filteredData.length === 0) { showToast("Data filter kosong.", "error"); return; }
    [...filteredData].sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(row => { let r = [formatDetailDate(row.date), row.wallet, row.type, row.category, row.desc, row.borrower||'-', row.amount, row.status]; csv += r.map(v => `"${v}"`).join(",") + "\n"; }); 
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Laporan_${activeWallet.toUpperCase()}_${new Date().toISOString().split('T')[0]}.csv`; 
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast("CSV Berhasil Diunduh", "success"); 
}

function renderShortcuts() { 
    const c = document.getElementById('quickActionsContainer'); 
    if(activeWallet === 'harian') { 
        c.className = 'quick-actions-wrap grid-mode grid-split-4'; 
        c.innerHTML = ` 
            <button class="btn-quick glow-merah" onclick="quickInput('keluar', 'Makan', 'Beli Makan')">${svgs.makan} <span>Beli Makan</span></button> 
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'Transport', 'Isi Bensin')">${svgs.transport} <span>Transport</span></button> 
            <button class="btn-quick glow-biru" onclick="quickInput('masuk', 'Top-Up', 'Isi Saldo')">${svgs.uang} <span>Isi Saldo</span></button> 
            <button class="btn-quick glow-ungu" onclick="quickInput('keluar', 'Dipinjam', 'Pinjamkan Uang', true)">${svgs.pinjam} <span>Dipinjam</span></button> 
            <button class="btn-quick glow-kuning" onclick="quickInput('keluar', 'MANUAL', '')">${svgs.plus} <span>Lainnya (-)</span></button> 
            <button class="btn-quick glow-hijau" onclick="quickInput('masuk', 'MANUAL', '')">${svgs.plus} <span>Lainnya (+)</span></button> 
        `; 
    } else { 
        c.className = 'quick-actions-wrap grid-mode grid-split-4'; 
        c.innerHTML = ` 
            <button class="btn-quick glow-kuning" onclick="quickInput('masuk', 'Top-Up', 'Setor Tabungan')">${svgs.uang} <span>Setor Tunai</span></button> 
            <button class="btn-quick glow-merah" onclick="quickInput('keluar', 'Pindah Harian', 'Tarik ke Dompet Harian')">${svgs.atm} <span>Tarik Harian</span></button> 
            <button class="btn-quick glow-merah" onclick="quickInput('keluar', 'Lainnya', 'Tarik Tunai')">${svgs.atm} <span>Tarik Lainnya</span></button> 
            <button class="btn-quick glow-ungu" onclick="quickInput('keluar', 'Dipinjam', 'Pinjamkan Uang', true)">${svgs.pinjam} <span>Dipinjam</span></button> 
        `; 
    } 
}

function toggleExpandStat(el, id) { 
    const items = document.getElementById(id).children; 
    if (el.classList.contains('expanded')) { for(let i of items) i.className = 'expand-item'; } 
    else { for(let i of items) i.className = (i === el) ? 'expand-item expanded' : 'expand-item collapsed'; } 
} 

function expandChart(el, id) { 
    if(!el.classList.contains('expanded')) { 
        for(let i of document.getElementById(id).children) i.className = (i === el) ? 'expand-item expanded' : 'expand-item collapsed'; 
        setTimeout(() => { if(typeof Chart !== 'undefined' && pieChart) pieChart.resize(); if(typeof Chart !== 'undefined' && barChart) barChart.resize(); if(typeof Chart !== 'undefined' && lineChart) lineChart.resize(); }, 100); 
        setTimeout(() => { if(typeof Chart !== 'undefined' && pieChart) pieChart.resize(); if(typeof Chart !== 'undefined' && barChart) barChart.resize(); if(typeof Chart !== 'undefined' && lineChart) lineChart.resize(); }, 550); 
    } 
} 

function closeChart(e, btn) { 
    e.stopPropagation(); 
    for(let i of btn.closest('.expand-container').children) i.className = 'expand-item'; 
    setTimeout(() => { if(typeof Chart !== 'undefined' && pieChart) pieChart.resize(); if(typeof Chart !== 'undefined' && barChart) barChart.resize(); if(typeof Chart !== 'undefined' && lineChart) lineChart.resize(); }, 100); 
    setTimeout(() => { if(typeof Chart !== 'undefined' && pieChart) pieChart.resize(); if(typeof Chart !== 'undefined' && barChart) barChart.resize(); if(typeof Chart !== 'undefined' && lineChart) lineChart.resize(); }, 550); 
}

// ==========================================
// 10. INPUT TRANSAKSI & ROUTING
// ==========================================
let isLoanMode = false;
function quickInput(type, cat, desc, isLoan = false) { 
    isLoanMode = isLoan; 
    document.getElementById('tx-type').value = type; 
    document.getElementById('modal-title').innerText = isLoan ? 'Catat Uang Dipinjam' : (type === 'masuk' ? 'Input Pemasukan' : 'Input Pengeluaran'); 
    document.getElementById('tx-desc').value = ''; 
    document.getElementById('tx-category-manual').value = ''; 
    document.getElementById('tx-borrower').value = ''; 
    document.getElementById('tx-is-saving').value = 'false'; 
    
    if(cat === 'MANUAL') { 
        document.getElementById('catSelectWrapper').style.display = 'none'; 
        document.getElementById('tx-category-manual').style.display = 'block'; 
        document.getElementById('label-kategori').innerText = 'Ketik Nama Kategori'; 
    } else { 
        document.getElementById('catSelectWrapper').style.display = 'block'; 
        document.getElementById('tx-category-manual').style.display = 'none'; 
        document.getElementById('label-kategori').innerText = 'Kategori'; 
        const box = document.getElementById('catOptionsBox'); 
        const arr = type === 'masuk' ? categories.masuk : categories.keluar; 
        box.innerHTML = arr.map(c => `<div class="custom-option" onclick="selectCategory('${c}')">${c}</div>`).join(''); 
        if(!arr.includes(cat)) box.innerHTML += `<div class="custom-option" onclick="selectCategory('${cat}')">${cat}</div>`; 
        selectCategory(cat); 
    } 
    
    const bw = document.getElementById('borrowerWrapper'); 
    const lbDesc = document.getElementById('label-desc'); 
    if(isLoanMode) { 
        bw.style.display = 'block'; lbDesc.innerText = 'Deskripsi (Opsional)'; document.getElementById('tx-desc').value = 'Uang Dipinjamkan'; 
    } else { 
        bw.style.display = 'none'; lbDesc.innerText = 'Deskripsi'; document.getElementById('tx-desc').value = desc; 
    } 
    
    document.getElementById('tx-amount').value = ''; rawAmount = 0; 
    document.getElementById('txModal').classList.add('active'); 
    setTimeout(() => { 
        if(isLoanMode) document.getElementById('tx-borrower').focus(); 
        else if(cat === 'MANUAL') document.getElementById('tx-category-manual').focus(); 
        else document.getElementById('tx-amount').focus(); 
    }, 300); 
}

document.getElementById('tx-amount').addEventListener('input', function() { 
    let v = this.value.replace(/[^0-9]/g, ''); 
    if(v === '') { rawAmount = 0; this.value = ''; return; } 
    rawAmount = parseInt(v, 10); this.value = rawAmount.toLocaleString('id-ID'); 
});

function lunasiPinjaman(e, txId) { 
    e.stopPropagation(); 
    promptTxPin(() => { 
        const strTxId = String(txId); 
        const idx = db.findIndex(t => String(t.id) === strTxId || String(t.date) === strTxId); 
        if(idx > -1) { 
            const tx = db[idx]; 
            let sisa = tx.status === 'dipinjam' ? tx.amount : parseInt(tx.status.split('_')[1]);

            document.getElementById('loanPaymentId').value = strTxId;
            document.getElementById('loanMaxAmount').value = sisa;
            document.getElementById('loanPaymentMsg').innerHTML = `Peminjam: <b style="color:var(--putih);">${tx.borrower}</b><br>Sisa Pinjaman: <b style="color:var(--kuning);">${formatRp(sisa)}</b>`;
            document.getElementById('loanPaymentInput').value = '';
            document.getElementById('loanPaymentModal').classList.add('active'); 
        } 
    }); 
}

function setFullLoanAmount() {
    const maxAmt = document.getElementById('loanMaxAmount').value;
    document.getElementById('loanPaymentInput').value = parseInt(maxAmt, 10).toLocaleString('id-ID');
}

async function processLoanPayment() {
    const strTxId = document.getElementById('loanPaymentId').value;
    const inputVal = document.getElementById('loanPaymentInput').value.replace(/[^0-9]/g, '');
    const payAmount = parseInt(inputVal, 10);
    const idx = db.findIndex(t => String(t.id) === strTxId || String(t.date) === strTxId);

    if(idx === -1 || isNaN(payAmount) || payAmount <= 0) { showToast("Nominal tidak valid!", "error"); return; }

    const tx = db[idx];
    let sisa = tx.status === 'dipinjam' ? tx.amount : parseInt(tx.status.split('_')[1]);

    if (payAmount > sisa) { showToast("Melebihi sisa pinjaman!", "error"); return; }

    const btn = document.getElementById('btnProsesLoan');
    if (btn.disabled) return;
    btn.disabled = true; btn.innerText = "Memproses...";

    try {
        const targetWallet = tx.wallet;
        let isFull = (payAmount === sisa);
        let newStatus = isFull ? 'lunas_pinjaman' : `cicil_${sisa - payAmount}`;
        const deskripsiLunas = isFull ? properTitleCase(`Lunas: ${tx.desc} (${tx.borrower})`) : properTitleCase(`Cicilan: ${tx.desc} (${tx.borrower})`);

        const lData = { wallet: targetWallet, type: 'masuk', category: isFull ? 'Lunas Pinjaman' : 'Cicilan Masuk', desc: deskripsiLunas, borrower: tx.borrower, amount: payAmount, date: new Date().toISOString(), status: isFull ? 'lunas_pinjaman' : 'cicilan_masuk' };

        if(APP_MODE === 'CLOUD') {
            if (navigator.onLine && sbClient && (!currentUser || currentUser.id !== 'offline_user')) {
                try {
                    lData.user_id = currentUser.id;
                    const updatePromise = sbClient.from('transactions').update({ status: newStatus }).eq('id', tx.id);
                    const insertPromise = sbClient.from('transactions').insert([lData]);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Server')), 5000));
                    
                    await Promise.race([Promise.all([updatePromise, insertPromise]), timeoutPromise]);
                    await fetchUserTransactions();
                    showToast(isFull ? "Pinjaman Lunas di Cloud" : "Cicilan Masuk ke Cloud", "success");
                } catch(err) {
                    db[idx].status = newStatus; lData.id = Date.now(); db.push(lData); pendingSync.push(lData);
                    savePendingSync(); saveLocalDB(db); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
                    showToast("Tersimpan (Menunggu Sync)", "syncing");
                }
            } else {
                db[idx].status = newStatus; lData.id = Date.now(); db.push(lData); pendingSync.push(lData);
                savePendingSync(); saveLocalDB(db); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
                showToast("Tersimpan (Menunggu Sync)", "syncing");
            }
        } else {
            db[idx].status = newStatus; lData.id = Date.now(); db.push(lData);
            saveLocalDB(db); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
            showToast(isFull ? "Pinjaman Lunas (Lokal)" : "Cicilan Diterima (Lokal)", "success");
        }
        closeModal('loanPaymentModal');
    } finally {
        btn.disabled = false; btn.innerText = "Proses Pembayaran";
    }
}

async function checkAndAutoLunasHutang() { 
    let inT = 0, outT = 0; 
    db.filter(t => t.wallet === 'harian').forEach(t => { if(t.type === 'masuk') inT += t.amount; else outT += t.amount; }); 
    if((inT - outT) >= 0) { 
        let clear = false; 
        for (let t of db) { 
            if(t.wallet === 'harian' && t.status === 'hutang') { 
                if(APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient) {
                    try {
                        await sbClient.from('transactions').update({ status: 'lunas_hutang' }).eq('id', t.id);
                    } catch(e) { t.status = 'lunas_hutang'; }
                } else {
                    t.status = 'lunas_hutang'; 
                }
                clear = true; 
            } 
        } 
        if(clear && (APP_MODE === 'GUEST' || !navigator.onLine || !currentUser || currentUser.id === 'offline_user')) saveLocalDB(db); 
        if(clear) showToast("Hutang otomatis lunas!", "success"); 
        if(clear && APP_MODE === 'CLOUD' && currentUser && currentUser.id !== 'offline_user' && navigator.onLine && sbClient) fetchUserTransactions();
    } 
}

document.getElementById('btnExecuteTx').addEventListener('click', async () => { 
    if(rawAmount <= 0) { showToast("Nominal 0", "error"); return; } 
    
    const isSaving = document.getElementById('tx-is-saving').value; 
    if (isSaving === 'true') return; 
    document.getElementById('tx-is-saving').value = 'true'; 
    
    try {
        const type = document.getElementById('tx-type').value; 
        let cF = document.getElementById('tx-category-manual').style.display === 'block' ? document.getElementById('tx-category-manual').value.trim() : document.getElementById('tx-category').value; 
        let dF = document.getElementById('tx-desc').value.trim(); 
        
        if(!cF || !dF) { showToast("Isi data dengan lengkap", "error"); return; } 
        const tabunganRegex = /tabung|tbgn|tbg|nabung/i;
        const isTabunganRelated = tabunganRegex.test(cF) || tabunganRegex.test(dF);
        
        cF = properTitleCase(cF); dF = properTitleCase(dF); 
        
        let stat = 'normal'; let brw = ''; let txToSave = []; 
        let sI_har = 0, sO_har = 0; db.filter(t => t.wallet === 'harian').forEach(t => { if(t.type === 'masuk') sI_har += t.amount; else sO_har += t.amount; }); let saldoHarian = sI_har - sO_har; 
        let sI_tab = 0, sO_tab = 0; db.filter(t => t.wallet === 'tabungan').forEach(t => { if(t.type === 'masuk') sI_tab += t.amount; else sO_tab += t.amount; }); let saldoTabungan = sI_tab - sO_tab; 

        if (activeWallet === 'harian' && isTabunganRelated) { 
            if (type === 'masuk') { showToast("Ditolak! Indikasi manipulasi tabungan.", "error"); return; } 
            else if (type === 'keluar') { 
                if (saldoHarian < rawAmount) { showToast(`Saldo harian kurang!`, "error"); return; } 
                txToSave.push({ wallet: 'harian', type: 'keluar', category: 'Pindah Tabungan', desc: 'Auto-Transfer Ke Tabungan', borrower: '', status: 'normal', amount: rawAmount, date: new Date().toISOString() }); 
                txToSave.push({ wallet: 'tabungan', type: 'masuk', category: 'Setor Manual', desc: dF, borrower: '', status: 'normal', amount: rawAmount, date: new Date().toISOString() }); 
            } 
        } else if (activeWallet === 'tabungan' && /pindah|harian|tarik/i.test(cF) && cF.toLowerCase().includes('harian')) { 
            if (type === 'keluar') { 
                if(rawAmount > saldoTabungan) { showToast("Saldo tabungan kurang!", "error"); return; } 
                txToSave.push({ wallet: 'tabungan', type: 'keluar', category: 'Pindah Harian', desc: dF || 'Tarik Ke Dompet Harian', borrower: '', status: 'normal', amount: rawAmount, date: new Date().toISOString() }); 
                txToSave.push({ wallet: 'harian', type: 'masuk', category: 'Dari Tabungan', desc: 'Suntikan Dana Tabungan', borrower: '', status: 'normal', amount: rawAmount, date: new Date().toISOString() }); 
            } 
        } else { 
            if(activeWallet === 'harian') { 
                if(type === 'keluar') { if(saldoHarian - rawAmount < 0) { stat = 'hutang'; showToast("Dicatat Hutang", "error"); } } 
                if (isLoanMode) { 
                    brw = properTitleCase(document.getElementById('tx-borrower').value.trim()); 
                    if(!brw) { showToast("Isi peminjam", "error"); return; } 
                    stat = 'dipinjam'; 
                } 
                txToSave.push({ wallet: activeWallet, type: type, category: cF, desc: dF, borrower: brw, status: stat, amount: rawAmount, date: new Date().toISOString() }); 
            } else if (activeWallet === 'tabungan') { 
                if (type === 'keluar') { 
                    if(rawAmount > saldoTabungan) { showToast("Saldo tabungan kurang!", "error"); return; } 
                    if (isLoanMode) { 
                        brw = properTitleCase(document.getElementById('tx-borrower').value.trim()); 
                        if(!brw) { showToast("Isi peminjam", "error"); return; } 
                        stat = 'dipinjam'; 
                        txToSave.push({ wallet: activeWallet, type: type, category: cF, desc: dF, borrower: brw, status: stat, amount: rawAmount, date: new Date().toISOString() }); 
                    } 
                    else { 
                        const baseTime = Date.now(); 
                        txToSave.push({ wallet: 'tabungan', type: 'keluar', category: 'Pencairan', desc: `Dicairkan Untuk: ${dF}`, borrower: '', status: 'normal', amount: rawAmount, date: new Date(baseTime).toISOString() }); 
                        txToSave.push({ wallet: 'harian', type: 'masuk', category: 'Dari Tabungan', desc: `Pencairan Untuk: ${dF}`, borrower: '', status: 'normal', amount: rawAmount, date: new Date(baseTime + 1000).toISOString() }); 
                        txToSave.push({ wallet: 'harian', type: 'keluar', category: cF, desc: dF, borrower: '', status: 'normal', amount: rawAmount, date: new Date(baseTime + 2000).toISOString() }); 
                    } 
                } else if (type === 'masuk') { 
                    if (saldoHarian < rawAmount) { showToast(`Saldo Harian kurang untuk ditabung!`, "error"); return; } 
                    txToSave.push({ wallet: 'harian', type: 'keluar', category: 'Pindah Tabungan', desc: 'Auto-Transfer Ke Tabungan', borrower: '', status: 'normal', amount: rawAmount, date: new Date().toISOString() }); 
                    txToSave.push({ wallet: 'tabungan', type: 'masuk', category: cF, desc: dF, borrower: '', status: 'normal', amount: rawAmount, date: new Date().toISOString() }); 
                } 
            } 
        } 
        
        if(APP_MODE === 'CLOUD') { 
            if (navigator.onLine && sbClient && (!currentUser || currentUser.id !== 'offline_user')) {
                try { 
                    const payload = txToSave.map(t => { let data = { ...t, user_id: currentUser.id }; delete data.id; return data; });
                    
                    const insertPromise = sbClient.from('transactions').insert(payload); 
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Server')), 5000));
                    
                    const { error } = await Promise.race([insertPromise, timeoutPromise]);
                    if(error) throw error;
                    
                    await fetchUserTransactions(); 
                    if(txToSave.some(t => t.wallet === 'harian' && t.type === 'masuk')) checkAndAutoLunasHutang(); 
                    closeModal('txModal'); showToast("Tersimpan di Cloud"); 
                } catch(e) { 
                    showToast("Jaringan lambat. Masuk Antrean Offline.", "syncing"); 
                    txToSave.forEach(t => { t.id = Date.now() + Math.random(); db.push(t); pendingSync.push(t); }); 
                    savePendingSync(); saveLocalDB(db); closeModal('txModal'); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '');
                    const netStatus = document.getElementById('networkStatus');
                    if(netStatus) { netStatus.innerText = "Offline (Menunggu Sync)"; netStatus.className = "status-sync sync-pending"; }
                }
            } else {
                txToSave.forEach(t => { t.id = Date.now() + Math.random(); db.push(t); pendingSync.push(t); }); 
                savePendingSync(); saveLocalDB(db); 
                if(txToSave.some(t => t.wallet === 'harian' && t.type === 'masuk')) checkAndAutoLunasHutang(); 
                closeModal('txModal'); updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
                showToast("Tersimpan Offline (Menunggu Sync)", "syncing"); 
                const netStatus = document.getElementById('networkStatus');
                if(netStatus) { netStatus.innerText = "Offline (Menunggu Sync)"; netStatus.className = "status-sync sync-pending"; }
            }
        } else { 
            txToSave.forEach(t => { t.id = Date.now() + Math.floor(Math.random() * 1000); db.push(t); }); 
            saveLocalDB(db); closeModal('txModal'); 
            if(txToSave.some(t => t.wallet === 'harian' && t.type === 'masuk')) checkAndAutoLunasHutang(); 
            updateUI(document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : ''); 
            showToast(txToSave.length > 1 ? "Tracker Transparan (Lokal)" : "Disimpan di Lokal"); 
        }
    } finally {
        document.getElementById('tx-is-saving').value = 'false'; 
    }
});

// ==========================================
// 11. RENDER UI, AI ENGINE & GRAFIK
// ==========================================
function updateHealthEngine(filteredDb) { 
    let tIn = 0, tOut = 0; filteredDb.forEach(t => { if(t.type === 'masuk') tIn += t.amount; else tOut += t.amount; }); 
    let balance = tIn - tOut; const badge = document.getElementById('healthBadge'); const text = document.getElementById('healthText'); badge.className = 'health-badge'; 
    if (tIn === 0 && tOut === 0) { badge.classList.add('health-netral'); text.innerText = 'Netral'; } else if (balance < 0) { badge.classList.add('health-defisit'); text.innerText = 'Defisit'; } else if (balance >= 0 && balance <= 50000) { badge.classList.add('health-kritis'); text.innerText = 'Kritis'; } else { if (tOut > (tIn * 0.8)) { badge.classList.add('health-waspada'); text.innerText = 'Waspada'; } else { badge.classList.add('health-sehat'); text.innerText = 'Sehat'; } } 
    generateAIForecast(filteredDb); 
}

function generateAIForecast(data) { 
    const box = document.getElementById('aiInsightBox'); const textEl = document.getElementById('aiInsightText'); aiMessages = []; 
    if (data.length === 0) { 
        aiMessages.push("Belum ada data transaksi. Ayo mulai catat aktivitas keuanganmu!");
        if(APP_MODE === 'GUEST') aiMessages.push("Info: Hubungkan dengan Google agar datamu tersimpan aman di Cloud.");
        
        box.style.borderLeftColor = 'var(--biru)'; 
        box.querySelector('svg').style.color = 'var(--biru)';
        
        startAICarousel(textEl); return; 
    } 
    
    const today = new Date(); const currentMonthData = data.filter(t => { const d = new Date(t.date); return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }); 
    const masukData = currentMonthData.filter(t => t.type === 'masuk'); const keluarData = currentMonthData.filter(t => t.type === 'keluar'); 
    let mIn = masukData.reduce((sum, t) => sum + t.amount, 0); let mOut = keluarData.reduce((sum, t) => sum + t.amount, 0); 
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(); 
    
    function calculateProjection(totalAmount) { 
        if (totalAmount === 0) return 0; 
        const currentDay = today.getDate(); 
        return (totalAmount / currentDay) * daysInMonth; 
    } 
    
    let biggestExpenseMsg = "Belum ada data pengeluaran bulan ini untuk dianalisis.";
    if (keluarData.length > 0) { let catTotals = {}; keluarData.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; }); let biggestCat = Object.keys(catTotals).reduce((a, b) => catTotals[a] > catTotals[b] ? a : b); biggestExpenseMsg = `Pengeluaran terbesarmu bulan ini tersedot di ${properTitleCase(biggestCat)} (${formatRp(catTotals[biggestCat])}).`; }
    
    if(APP_MODE === 'GUEST') aiMessages.push("Info: Wajib login (Google) jika ingin fitur Auto-Sync aktif!");
    aiMessages.push("Info: Saldo harian wajib diisi, karena akan mutasi otomatis dari dompet ke tabungan."); 
    aiMessages.push("💡 Tips: Dukung developer aplikasi ini dengan cara traktir di menu Profil!");
    
    let statusMsg = "", projectionMsg = "";
    if (activeWallet === 'harian') { 
        if (mOut > mIn && mIn > 0) { statusMsg = "⚠️ Peringatan! Total pengeluaran harianmu telah melampaui uang masuk bulan ini."; projectionMsg = "Saran AI: Segera kurangi pengeluaran agar keuangan tidak defisit di akhir bulan!"; box.style.borderLeftColor = 'var(--merah)'; box.querySelector('svg').style.color = 'var(--merah)'; } 
        else if (mOut > 0) { 
            let forecastOut = calculateProjection(mOut); 
            statusMsg = "Aktivitas kas berjalan normal sesuai rutinitas harianmu."; 
            projectionMsg = `Membaca Pola: Proyeksi pengeluaran harianmu di akhir bulan berpotensi mencapai ${formatRp(Math.round(forecastOut))}.`; 
            box.style.borderLeftColor = 'var(--kuning)'; box.querySelector('svg').style.color = 'var(--kuning)'; 
        } 
        else if (mIn > 0 && mOut === 0) { statusMsg = "Awal yang luar biasa! Aset harianmu bulan ini masih utuh 100%."; projectionMsg = "Pertahankan! Jangan biarkan pengeluaran impulsif merusak rekor ini."; box.style.borderLeftColor = 'var(--hijau)'; box.querySelector('svg').style.color = 'var(--hijau)'; } 
        else { statusMsg = "Belum ada pergerakan kas harian di bulan ini."; projectionMsg = "Tips: Catat pemasukan pertamamu untuk memulai analitik cerdas!"; box.style.borderLeftColor = 'var(--biru)'; box.querySelector('svg').style.color = 'var(--biru)';}
    } else { 
        if (mOut > mIn && mIn > 0) { 
            statusMsg = "⚠️ Tabungan defisit! Penarikan danamu bulan ini menghabiskan semua yang disetor."; 
            projectionMsg = `Saran AI: Segera kembalikan dana sebesar ${formatRp(mOut - mIn)} yang terpakai!`; 
            box.style.borderLeftColor = 'var(--merah)'; box.querySelector('svg').style.color = 'var(--merah)'; 
        } 
        else if (mIn > 0) { 
            let netSavings = mIn - mOut; 
            statusMsg = "Status Brankas: Pertumbuhan tabunganmu sedang berjalan."; 
            if (netSavings > 0) { 
                projectionMsg = `Bulan ini kamu berhasil menyisihkan bersih ${formatRp(netSavings)} ke tabungan. Hebat, pertahankan konsistensi ini!`; 
                box.style.borderLeftColor = 'var(--hijau)'; box.querySelector('svg').style.color = 'var(--hijau)'; 
            } else { 
                projectionMsg = "Saldo yang masuk bulan ini sudah habis ditarik. Yuk, coba kurangi penarikan tabungan!"; 
                box.style.borderLeftColor = 'var(--kuning)'; box.querySelector('svg').style.color = 'var(--kuning)'; 
            } 
        } 
        else if (mIn === 0 && mOut === 0) { 
            statusMsg = "Brankas tabunganmu belum ada aktivitas bulan ini."; 
            projectionMsg = "Tips: Yuk, mulai sisihkan uangmu hari ini untuk disetor ke tabungan!"; 
            box.style.borderLeftColor = 'var(--biru)'; box.querySelector('svg').style.color = 'var(--biru)'; 
        }
        else if (mIn === 0 && mOut > 0) {
            statusMsg = "⚠️ Bahaya! Kamu menarik tabungan tanpa ada setoran bulan ini.";
            projectionMsg = "Saran AI: Jangan biarkan brankasmu kosong, usahakan ganti uang yang ditarik ya!";
            box.style.borderLeftColor = 'var(--merah)'; box.querySelector('svg').style.color = 'var(--merah)';
        }
    } 
    aiMessages.push(statusMsg); aiMessages.push(projectionMsg); aiMessages.push(biggestExpenseMsg);
    aiMessages = [...new Set(aiMessages)].filter(m => m !== "");
    startAICarousel(textEl); 
}

function startAICarousel(textEl) { 
    if (aiCarouselInterval) clearInterval(aiCarouselInterval); 
    aiCurrentMsgIdx = 0; 
    
    textEl.style.minHeight = ''; 
    textEl.style.display = ''; 
    textEl.style.alignItems = ''; 
    
    textEl.innerText = aiMessages[0]; 
    textEl.classList.remove('fade-out'); 
    
    if (aiMessages.length > 1) { 
        aiCarouselInterval = setInterval(() => { 
            textEl.classList.add('fade-out'); 
            setTimeout(() => { 
                aiCurrentMsgIdx = (aiCurrentMsgIdx + 1) % aiMessages.length; 
                textEl.innerText = aiMessages[aiCurrentMsgIdx]; 
                textEl.classList.remove('fade-out'); 
            }, 400); 
        }, 10000); 
    } 
}

function openReceipt(txId) { 
    const strTxId = String(txId); const tx = db.find(t => String(t.id) === strTxId || String(t.date) === strTxId); if(!tx) return; 
    const rDate = formatDetailDate(tx.date); const rId = "TRX-" + new Date(tx.date).getTime().toString().slice(-8); 
    const rType = tx.type === 'masuk' ? 'Pemasukan' : 'Pengeluaran'; const rColor = tx.type === 'masuk' ? 'var(--hijau)' : 'var(--merah)'; 
    document.getElementById('receiptContent').innerHTML = ` 
        <div class="receipt-head">
            <h3 style="margin:0 0 5px 0; color:var(--putih);">BUKTI MUTASI</h3>
            <span style="font-size:11px; color:var(--text-muted); letter-spacing: 1px;">ID: ${rId}</span>
        </div> 
        <div class="receipt-row"><span class="receipt-label">Waktu</span><span class="receipt-val">${rDate}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Dompet</span><span class="receipt-val" style="text-transform:capitalize;">${tx.wallet}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Kategori</span><span class="receipt-val">${tx.category}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Sifat</span><span class="receipt-val" style="color:${rColor};">${rType}</span></div> 
        <div class="receipt-row"><span class="receipt-label">Keterangan</span><span class="receipt-val">${tx.desc}</span></div> 
        ${tx.borrower ? `<div class="receipt-row"><span class="receipt-label" style="color:var(--kuning);">Peminjam</span><span class="receipt-val" style="color:var(--kuning);">${tx.borrower}</span></div>` : ''} 
        <div class="receipt-row" style="margin-top:25px; border-top:2px dashed var(--border); padding-top:20px; align-items: flex-end; flex-wrap: nowrap !important;"> 
            <span class="receipt-label" style="font-size:14px; color:var(--putih); flex-shrink: 0;">TOTAL</span> 
            <span class="receipt-val" style="font-size: clamp(16px, 5.5vw, 22px); color:${rColor}; letter-spacing:-1px; white-space: nowrap !important; word-break: keep-all !important; flex-grow: 1; text-align: right;">${formatRp(tx.amount)}</span> 
        </div> 
    `; 
    document.getElementById('receiptModal').classList.add('active'); 
}

const searchInput = document.getElementById('searchTxInput'); 
const searchClear = document.getElementById('searchClearBtn'); 
if(searchInput) {
    searchInput.addEventListener('input', function(e) { 
        let val = e.target.value.toLowerCase(); searchClear.style.display = val.length > 0 ? 'block' : 'none'; updateUI(val); 
    }); 
}
function clearSearch() { searchInput.value = ''; searchClear.style.display = 'none'; updateUI(''); }

function updateUI(searchTerm = '') {
    let tI = 0, tO = 0; 
    db.filter(t => t.wallet === 'harian').forEach(t => { if(t.type === 'masuk') tI += t.amount; else tO += t.amount; });
    const ban = document.getElementById('debtBannerContainer');
    if(activeWallet === 'harian' && (tI - tO) < 0) {
        ban.innerHTML = `<div class="hutang-banner"><div><span style="font-size:11px; font-weight:900; color:var(--merah);">Status Defisit</span><br><span style="font-size:16px; font-weight:900;">Minus: ${formatRp(Math.abs(tI - tO))}</span></div><button class="btn-quick glow-biru" style="padding:10px 15px; font-size:12px;" onclick="quickInput('masuk','Top-Up','Tutup Hutang')"><span>Top-Up</span></button></div>`;
    } else { ban.innerHTML = ''; }

    const today = new Date(); today.setHours(0,0,0,0);
    const fd = db.filter(tx => { 
        if(tx.wallet !== activeWallet) return false; 
        if(currentTimeFilter !== 0) { const d = new Date(tx.date); d.setHours(0,0,0,0); if(Math.floor(Math.abs(today - d) / 86400000) > currentTimeFilter) return false; } 
        if(searchTerm) { return tx.desc.toLowerCase().includes(searchTerm) || tx.category.toLowerCase().includes(searchTerm) || (tx.borrower && tx.borrower.toLowerCase().includes(searchTerm)); } 
        return true; 
    });

    updateHealthEngine(fd);
    let m = 0, k = 0; fd.forEach(t => { if(t.type === 'masuk') m += t.amount; else k += t.amount; });
    
    const dispSaldo = document.getElementById('disp-saldo');
    if(dispSaldo) { dispSaldo.setAttribute('data-short', formatRpPendek(m - k)); dispSaldo.setAttribute('data-full', formatRp(m - k)); }

    const dispMasuk = document.getElementById('disp-masuk');
    if(dispMasuk) { dispMasuk.setAttribute('data-short', formatRpPendek(m)); dispMasuk.setAttribute('data-full', formatRp(m)); }

    const dispKeluar = document.getElementById('disp-keluar');
    if(dispKeluar) { dispKeluar.setAttribute('data-short', formatRpPendek(k)); dispKeluar.setAttribute('data-full', formatRp(k)); }
    
    renderTable(fd); renderCharts(fd);
}

function renderTable(data) {
    const t = document.getElementById('table-body'); t.innerHTML = '';
    if(data.length === 0) { 
        t.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 30px; color:var(--text-muted);">Tidak ada transaksi pada rentang waktu ini.</td></tr>`; return; 
    }
    
    [...data].sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
        const iM = tx.type === 'masuk'; let c = getDynamicColor(tx.category, tx.type);
        let dr = `<span style="font-weight:700;">${tx.desc}</span>`;
            if(tx.status === 'dipinjam' || String(tx.status).startsWith('cicil_')) {
            let sisaInfo = '';
            if(String(tx.status).startsWith('cicil_')) {
                let sisa = parseInt(tx.status.split('_')[1]);
                sisaInfo = `<br><span style="font-size:11px; color:var(--oranye); font-weight:800;">Sisa Pinjaman: ${formatRp(sisa)}</span>`;
            }
            dr = `<span style="font-weight:700; color:#a855f7;">${tx.desc}</span><br><span style="font-size:11px; color:var(--text-muted);">Peminjam: <b style="color:var(--kuning);">${tx.borrower}</b></span>${sisaInfo}`;
        }
        else if ((tx.status === 'lunas_pinjaman' || tx.status === 'cicilan_masuk') && tx.borrower) dr = `<span style="font-weight:700; color:var(--hijau);">${tx.desc}</span><br><span style="font-size:11px; color:var(--text-muted);">Peminjam: <b style="color:var(--putih);">${tx.borrower}</b></span>`;
        
        let cr = `<div class="badge-cat" style="border: 1px solid ${c}; color:${c}; background:rgba(0,0,0,0.5);">${tx.category}</div>`;
        if(tx.status === 'hutang') cr = `<div class="badge-cat" style="border: 1px solid var(--merah); color:var(--merah); background:rgba(239,68,68,0.2);">HUTANG</div>`;
        else if (tx.status === 'lunas_hutang') cr = `<div class="badge-cat" style="border: 1px solid var(--hijau); color:var(--hijau); background:rgba(16,185,129,0.1);">LUNAS</div>`;
        else if (tx.status === 'dipinjam' || String(tx.status).startsWith('cicil_')) {
            let btnText = String(tx.status).startsWith('cicil_') ? 'DICICIL' : 'DIPINJAM';
            cr = `<div style="display:flex; flex-direction:column; gap:5px;"><div class="badge-cat" style="border: 1px solid #a855f7; color:#a855f7; background:rgba(168,85,247,0.2);">${btnText}</div><button class="btn-lunasi" onclick="lunasiPinjaman(event, '${tx.id || tx.date}')">${svgs.check} BAYAR</button></div>`;
        }
        else if (tx.status === 'lunas_pinjaman') cr = `<div class="badge-cat" style="border: 1px solid var(--hijau); color:var(--hijau); background:rgba(16,185,129,0.1);">LUNAS</div>`;
        else if (tx.status === 'cicilan_masuk') cr = `<div class="badge-cat" style="border: 1px solid var(--kuning); color:var(--kuning); background:rgba(245,158,11,0.1);">CICILAN</div>`;

        t.innerHTML += `<tr class="clickable-row" onclick="openReceipt('${tx.id || tx.date}')"><td style="color:var(--text-muted); font-size:11px;">${formatDetailDate(tx.date).split(' - ')[0]}<br>${formatDetailDate(tx.date).split(' - ')[1]}</td><td>${cr}</td><td>${dr}</td><td class="amt-cell" style="color:${iM?'var(--biru)':'var(--merah)'};">${iM?'+':'-'}${formatRp(tx.amount)}</td></tr>`;
    });
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') { console.warn("Sistem Grafik Offline."); return; }
    if (!document.getElementById('pieChart')) return; 
    Chart.defaults.color = '#64748b'; Chart.defaults.font.family = 'Inter';
    
    if(data.length === 0) {
        if(pieChart) pieChart.destroy(); if(barChart) barChart.destroy(); if(lineChart) lineChart.destroy();
        return;
    }

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const gridLineColor = currentTheme === 'light' ? '#cbd5e1' : '#1e293b';
    
    const cA = {}; 
    data.forEach(t => { const k = `${t.category}`; if(cA[k]) { cA[k].a += t.amount; } else { cA[k] = { a: t.amount, color: getDynamicColor(t.category, t.type) }; } }); 
    const pL = Object.keys(cA);
    
    if(pieChart) pieChart.destroy(); 
    pieChart = new Chart(document.getElementById('pieChart'), { type: 'doughnut', data: { labels: pL, datasets: [{ data: pL.map(l => cA[l].a), backgroundColor: pL.map(l => cA[l].color), borderWidth: 4, borderColor: currentTheme === 'light' ? '#ffffff' : '#050814' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + formatRp(c.raw); } } } } } });

    const rT = [...data].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-15);
    if(barChart) barChart.destroy(); 
    barChart = new Chart(document.getElementById('barChart'), { type: 'bar', data: { labels: rT.map(t => t.desc.substring(0,8)), datasets: [{ data: rT.map(t => t.type === 'masuk' ? t.amount : -t.amount), backgroundColor: rT.map(t => getDynamicColor(t.category, t.type)), borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + formatRp(Math.abs(c.raw)); } } } }, scales: { x: { display: false }, y: { grid: { color: gridLineColor } } } } });

    let cI = 0, cO = 0, hI = [], hO = []; 
    [...data].sort((a,b)=> new Date(a.date)-new Date(b.date)).forEach(t => { if(t.type === 'masuk') cI += t.amount; else cO += t.amount; hI.push(cI); hO.push(cO); });
    if(lineChart) lineChart.destroy(); 
    lineChart = new Chart(document.getElementById('lineChart'), { type: 'line', data: { labels: hI.map((_,i)=> `T${i+1}`), datasets: [{ label: 'Pemasukan Total', data: hI, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, pointRadius: 3, tension: 0.3 }, { label: 'Pengeluaran Total', data: hO, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, pointRadius: 3, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + formatRp(c.raw); } } } }, scales: { x: { display: false }, y: { grid: { color: gridLineColor } } } } });
}

// ==========================================
// 12. SISTEM LUPA PIN & OTP EMAIL
// ==========================================
function startOTPResetProcess() {
    closeModal('pinAuthModal'); closeModal('resetPinModal'); closeModal('resetTxPinAuthModal');
    if(!profile.googleLinked || !profile.googleEmail) { showToast("Akun belum terhubung ke Google!", "error"); return; }
    if(!navigator.onLine) { showToast("Reset PIN butuh koneksi internet!", "error"); return; }
    
    document.getElementById('displayUserEmail').innerText = profile.googleEmail;
    document.getElementById('otpRequestModal').classList.add('active');
}

function sendOTPEmail() {
    if(!navigator.onLine) { showToast("Koneksi terputus!", "error"); return; }
    const btn = document.getElementById('btnSendOTP');
    btn.innerText = "Mengirim..."; btn.disabled = true;

    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    otpExpiryTime = Date.now() + (5 * 60 * 1000);

    const templateParams = { to_email: profile.googleEmail, to_name: profile.name, otp_code: generatedOTP };
    emailjs.send('service_4v89q7h', 'template_5q05e2d', templateParams)
        .then(function() {
            showToast("Kode terkirim ke Email!", "success"); closeModal('otpRequestModal');
            document.getElementById('inputOTP').value = ''; document.getElementById('inputNewPinOTP').value = '';
            document.getElementById('otpVerifyModal').classList.add('active');
            btn.innerText = "Kirim Kode Sekarang"; btn.disabled = false;
        }, function() {
            showToast("Gagal mengirim email!", "error"); btn.innerText = "Kirim Kode Sekarang"; btn.disabled = false;
        });
}

async function verifyOTPAndSavePin() {
    const inputCode = document.getElementById('inputOTP').value;
    const newPin = document.getElementById('inputNewPinOTP').value;

    if(Date.now() > otpExpiryTime) { showToast("Kode OTP Kadaluarsa!", "error"); return; }
    if(inputCode !== generatedOTP) { showToast("Kode OTP Salah!", "error"); return; }
    if(newPin.length < 4) { showToast("PIN Baru minimal 4 digit!", "error"); return; }

    profile.pin = await hashPIN(newPin);
    profile.txPin = ''; 
    
    saveProfileLocal();
    await saveProfileToSupabase();
    
    generatedOTP = ""; 
    closeModal('otpVerifyModal');
    showToast("PIN Utama berhasil direset!", "success");
}

// ==========================================
// FITUR DARK / LIGHT MODE
// ==========================================
const iconSun = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
const iconMoon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

const savedTheme = localStorage.getItem('finance_app_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

window.addEventListener('DOMContentLoaded', () => {
    updateThemeIcon(savedTheme);
});

function toggleTheme() {
    const htmlEl = document.documentElement;
    const currentTheme = htmlEl.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    htmlEl.setAttribute('data-theme', newTheme);
    localStorage.setItem('finance_app_theme', newTheme);
    updateThemeIcon(newTheme);
    
    const searchTerm = document.getElementById('searchTxInput') ? document.getElementById('searchTxInput').value : '';
    if(typeof updateUI === 'function') updateUI(searchTerm);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    
    if (theme === 'light') {
        btn.innerHTML = iconMoon;
        btn.style.color = '#64748b'; 
    } else {
        btn.innerHTML = iconSun;
        btn.style.color = 'var(--kuning)'; 
    }
}

// ==========================================
// 13. NYALAKAN MESIN UTAMA & DAFTARKAN PWA/OFFLINE
// ==========================================
window.addEventListener('load', () => {
    bootApp();
    
    setTimeout(() => {
        showToast(`Suka dengan aplikasi ini? Yuk <b style="color:var(--kuning);">Dukung Developer</b> dengan cara traktir di menu Profil! ☕`, "syncing");
    }, 15000);
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            console.log(`Penyimpanan Permanen: ${isPersisted ? "AKTIF" : "TERBLOKIR"}`);
        }

        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('Service Worker terdaftar!', reg.scope);
            
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        const updateScreen = document.getElementById('updateScreen');
                        if (updateScreen) {
                            updateScreen.style.display = 'flex';
                            const updateText = updateScreen.querySelector('p');
                            if(updateText) updateText.innerText = "MENGUNDUH PEMBARUAN SISTEM...";
                        }
                        
                        setTimeout(() => window.location.reload(true), 1500);
                    }
                });
            });
        }).catch(err => console.error('Service Worker Gagal!', err));
    });
    
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload(true);
        }
    });
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        setTimeout(() => {
            if (typeof Chart !== 'undefined') {
                for (let id in Chart.instances) {
                    Chart.instances[id].resize();
                    Chart.instances[id].update();
                }
            }
        }, 300);
    }
});

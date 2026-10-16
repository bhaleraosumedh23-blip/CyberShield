const API = "/api";

async function api(path, options = {}) {
    const res = await fetch(API + path, {
        credentials: "include",
        ...options
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(data.message || "Server error");
    return data;
}

function showSection(id){
    document.querySelectorAll(".section").forEach(section => section.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
    window.scrollTo({top:0, behavior:"smooth"});
}

function toast(message){
    const box = document.getElementById("toast");
    box.innerText = message;
    box.style.display = "block";
    setTimeout(() => box.style.display = "none", 3000);
}

function generateComplaintID(){
    return "CYB" + Math.floor(100000 + Math.random()*900000);
}

function escapeHTML(value){
    return String(value ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
}

function normalizeComplaint(c){
    return {...c, id: c.complaintId || c.id};
}

document.getElementById("complaintForm").addEventListener("submit", async function(e){
    e.preventDefault();
    try {
        const fd = new FormData();
        fd.append("name", document.getElementById("name").value);
        fd.append("mobile", document.getElementById("mobile").value);
        fd.append("email", document.getElementById("email").value);
        fd.append("category", document.getElementById("category").value);
        fd.append("incidentDate", document.getElementById("incidentDate").value);
        fd.append("amount", document.getElementById("amount").value);
        fd.append("transaction", document.getElementById("transaction").value);
        fd.append("description", document.getElementById("description").value);

        const files = document.getElementById("evidence").files;
        for (const file of files) fd.append("evidence", file);

        const data = await api("/complaints", {method:"POST", body:fd});

        document.getElementById("generatedId").innerText = data.complaint.id;
        document.getElementById("complaintModal").style.display = "flex";
        this.reset();
        document.getElementById("incidentDate").valueAsDate = new Date();
        toast("Complaint submitted successfully.");
    } catch (err) {
        toast("❌ " + err.message);
    }
});

function closeModal(){
    document.getElementById("complaintModal").style.display = "none";
    showSection("track");
}

async function trackComplaint(){
    const id = document.getElementById("trackId").value.trim().toUpperCase();
    const result = document.getElementById("trackResult");
    result.style.display = "block";

    if (!id) {
        result.innerHTML = `<div class="alert warning">Please enter your Complaint ID.</div>`;
        return;
    }

    try {
        const data = await api("/complaints/" + encodeURIComponent(id));
        const complaint = normalizeComplaint(data.complaint);
        let currentStep = 1;
        if (complaint.status === "Under Review") currentStep = 2;
        if (complaint.status === "Investigation") currentStep = 3;
        if (complaint.status === "Resolved") currentStep = 4;

        let statusClass = "submitted";
        if (complaint.status === "Under Review") statusClass = "review";
        if (complaint.status === "Investigation") statusClass = "investigation";
        if (complaint.status === "Resolved") statusClass = "resolved";

        result.innerHTML = `
        <h2>Complaint Details</h2><br>
        <p><b>Complaint ID:</b> ${escapeHTML(complaint.id)}</p>
        <p><b>Name:</b> ${escapeHTML(complaint.name)}</p>
        <p><b>Category:</b> ${escapeHTML(complaint.category)}</p>
        <p><b>Incident Date:</b> ${escapeHTML(complaint.incidentDate)}</p>
        <p><b>Registered:</b> ${escapeHTML(complaint.date || complaint.createdAt)}</p>
        <br>
        <h3>📊 Complaint Progress</h3>
        <div class="progress-container">
          <div class="progress-step ${currentStep>=1?"active":""}"><div class="circle">1</div><p>Submitted</p></div>
          <div class="progress-line ${currentStep>=2?"active-line":""}"></div>
          <div class="progress-step ${currentStep>=2?"active":""}"><div class="circle">2</div><p>Under Review</p></div>
          <div class="progress-line ${currentStep>=3?"active-line":""}"></div>
          <div class="progress-step ${currentStep>=3?"active":""}"><div class="circle">3</div><p>Investigation</p></div>
          <div class="progress-line ${currentStep>=4?"active-line":""}"></div>
          <div class="progress-step ${currentStep>=4?"active":""}"><div class="circle">4</div><p>Resolved</p></div>
        </div>
        <br>
        <p><b>Current Status:</b> <span class="status ${statusClass}">${escapeHTML(complaint.status)}</span></p>
        <br>
        <div class="alert info"><b>Latest Remark:</b><br><br>${escapeHTML(complaint.remark || "")}</div>`;
    } catch (err) {
        result.innerHTML = `<div class="alert danger-alert">❌ Complaint not found.<br><br>Please check your Complaint ID.</div>`;
    }
}

function openAdmin(){
    api("/auth/me").then(() => {
        showSection("dashboard");
        updateDashboard();
    }).catch(() => showSection("login"));
}

document.getElementById("loginForm").addEventListener("submit", async function(e){
    e.preventDefault();
    try {
        await api("/auth/login", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
                email:document.getElementById("adminEmail").value,
                password:document.getElementById("adminPassword").value
            })
        });
        toast("Admin login successful.");
        showSection("dashboard");
        updateDashboard();
    } catch (err) {
        toast("❌ Invalid admin login.");
    }
});

function togglePassword(){
    const password = document.getElementById("adminPassword");
    password.type = password.type === "password" ? "text" : "password";
}

async function adminLogout(){
    try { await api("/auth/logout", {method:"POST"}); } catch (_) {}
    toast("Admin logged out.");
    showSection("home");
}

async function changeStatus(index,status){
    try {
        const rows = await api("/admin/complaints");
        const c = rows.complaints[index];
        if (!c) return;
        await api("/admin/complaints/" + encodeURIComponent(c.id), {
            method:"PATCH",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({status})
        });
        await updateDashboard();
        toast("Complaint status updated.");
    } catch (err) {
        toast("❌ " + err.message);
    }
}

async function deleteComplaint(index){
    try {
        const rows = await api("/admin/complaints");
        const c = rows.complaints[index];
        if (!c) return;
        if (!confirm("Delete this complaint?")) return;
        await api("/admin/complaints/" + encodeURIComponent(c.id), {method:"DELETE"});
        await updateDashboard();
        toast("Complaint deleted.");
    } catch (err) {
        toast("❌ " + err.message);
    }
}

async function updateDashboard(){
    try {
        const data = await api("/admin/dashboard");
        const complaints = data.complaints || [];
        const feedback = data.feedback || [];

        document.getElementById("totalCount").innerText = data.stats.total;
        document.getElementById("submittedCount").innerText = data.stats.submitted;
        document.getElementById("reviewCount").innerText = data.stats.review;
        document.getElementById("investigationCount").innerText = data.stats.investigation;
        document.getElementById("resolvedCount").innerText = data.stats.resolved;

        const table = document.getElementById("complaintTable");
        table.innerHTML = "";
        complaints.forEach((c,index)=>{
            let statusClass="submitted";
            if(c.status==="Under Review") statusClass="review";
            if(c.status==="Investigation") statusClass="investigation";
            if(c.status==="Resolved") statusClass="resolved";
            table.innerHTML += `
            <tr>
              <td>${escapeHTML(c.id)}</td>
              <td>${escapeHTML(c.name)}</td>
              <td>${escapeHTML(c.category)}</td>
              <td>${escapeHTML(c.incidentDate)}</td>
              <td><span class="status ${statusClass}">${escapeHTML(c.status)}</span></td>
              <td>
                <select onchange="changeStatus(${index},this.value)">
                  <option ${c.status==="Submitted"?"selected":""}>Submitted</option>
                  <option ${c.status==="Under Review"?"selected":""}>Under Review</option>
                  <option ${c.status==="Investigation"?"selected":""}>Investigation</option>
                  <option ${c.status==="Resolved"?"selected":""}>Resolved</option>
                </select>
              </td>
              <td><button class="btn danger" onclick="deleteComplaint(${index})">Delete</button></td>
            </tr>`;
        });

        const feedbackTable = document.getElementById("feedbackTable");
        feedbackTable.innerHTML = "";
        feedback.forEach(f=>{
            feedbackTable.innerHTML += `
            <tr>
              <td>${escapeHTML(f.name)}</td>
              <td>${"⭐".repeat(Number(f.rating))}</td>
              <td>${escapeHTML(f.text)}</td>
              <td>${escapeHTML(f.date || f.createdAt)}</td>
            </tr>`;
        });
    } catch (_) {
        // Public page remains usable when admin session is absent.
    }
}

document.getElementById("suspiciousForm").addEventListener("submit", async function(e){
    e.preventDefault();
    try {
        await api("/suspicious", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
                name:document.getElementById("susName").value,
                type:document.getElementById("susType").value,
                source:document.getElementById("susSource").value,
                details:document.getElementById("susDetails").value
            })
        });
        this.reset();
        toast("Suspicious activity report submitted.");
    } catch (err) { toast("❌ " + err.message); }
});

document.getElementById("feedbackForm").addEventListener("submit", async function(e){
    e.preventDefault();
    try {
        await api("/feedback", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
                name:document.getElementById("feedbackName").value,
                rating:document.getElementById("rating").value,
                text:document.getElementById("feedbackText").value
            })
        });
        this.reset();
        toast("⭐ Thank you for your feedback!");
    } catch (err) { toast("❌ " + err.message); }
});

const translations = {
en:{home:"Home",report:"Report Fraud",track:"Track",suspicious:"Suspicious Activity",awareness:"Awareness",safety:"Safety",feedback:"Feedback"},
hi:{home:"होम",report:"धोखाधड़ी रिपोर्ट करें",track:"शिकायत ट्रैक करें",suspicious:"संदिग्ध गतिविधि",awareness:"जागरूकता",safety:"सुरक्षा",feedback:"प्रतिक्रिया"},
mr:{home:"मुख्यपृष्ठ",report:"फसवणूक नोंदवा",track:"तक्रार ट्रॅक करा",suspicious:"संशयास्पद गतिविधी",awareness:"जागरूकता",safety:"सुरक्षा",feedback:"अभिप्राय"},
bn:{home:"হোম",report:"প্রতারণা রিপোর্ট করুন",track:"অভিযোগ ট্র্যাক করুন",suspicious:"সন্দেহজনক কার্যকলাপ",awareness:"সচেতনতা",safety:"নিরাপত্তা",feedback:"প্রতিক্রিয়া"},
gu:{home:"હોમ",report:"છેતરપિંડીની જાણ કરો",track:"ફરિયાદ ટ્રેક કરો",suspicious:"શંકાસ્પદ પ્રવૃત્તિ",awareness:"જાગૃતિ",safety:"સુરક્ષા",feedback:"પ્રતિસાદ"},
ta:{home:"முகப்பு",report:"மோசடியைப் புகாரளிக்கவும்",track:"புகாரைக் கண்காணிக்கவும்",suspicious:"சந்தேகமான செயல்பாடு",awareness:"விழிப்புணர்வு",safety:"பாதுகாப்பு",feedback:"கருத்து"},
te:{home:"హోమ్",report:"మోసాన్ని నివేదించండి",track:"ఫిర్యాదును ట్రాక్ చేయండి",suspicious:"అనుమానాస్పద కార్యకలాపం",awareness:"అవగాహన",safety:"భద్రత",feedback:"అభిప్రాయం"},
kn:{home:"ಮುಖಪುಟ",report:"ವಂಚನೆಯನ್ನು ವರದಿ ಮಾಡಿ",track:"ದೂರು ಟ್ರ್ಯಾಕ್ ಮಾಡಿ",suspicious:"ಅನುಮಾನಾಸ್ಪದ ಚಟುವಟಿಕೆ",awareness:"ಜಾಗೃತಿ",safety:"ಸುರಕ್ಷತೆ",feedback:"ಪ್ರತಿಕ್ರಿಯೆ"},
ml:{home:"ഹോം",report:"തട്ടിപ്പ് റിപ്പോർട്ട് ചെയ്യുക",track:"പരാതി ട്രാക്ക് ചെയ്യുക",suspicious:"സംശയാസ്പദമായ പ്രവർത്തനം",awareness:"അവബോധം",safety:"സുരക്ഷ",feedback:"അഭിപ്രായം"},
pa:{home:"ਹੋਮ",report:"ਧੋਖਾਧੜੀ ਦੀ ਰਿਪੋਰਟ ਕਰੋ",track:"ਸ਼ਿਕਾਇਤ ਟਰੈਕ ਕਰੋ",suspicious:"ਸ਼ੱਕੀ ਗਤੀਵਿਧੀ",awareness:"ਜਾਗਰੂਕਤਾ",safety:"ਸੁਰੱਖਿਆ",feedback:"ਫੀਡਬੈਕ"}
};

function changeLanguage(){
    const lang=document.getElementById("languageSelect").value;
    const data=translations[lang];
    document.querySelectorAll(".nav-links button").forEach(button=>{
        const map={"Home":"home","Report Fraud":"report","Track":"track","Suspicious Activity":"suspicious","Awareness":"awareness","Safety":"safety","Feedback":"feedback"};
        const key=map[button.innerText.trim()];
        if(key) button.innerText=data[key];
    });
    document.documentElement.lang=lang;
    toast("Language changed.");
}

document.getElementById("incidentDate").valueAsDate = new Date();

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!MONGO_URI || !JWT_SECRET || !ADMIN_EMAIL || !ADMIN_PASSWORD_HASH) {
  console.error("Missing MONGO_URI, JWT_SECRET, ADMIN_EMAIL or ADMIN_PASSWORD_HASH in .env");
  process.exit(1);
}

app.use(express.json({limit:"2mb"}));
app.use(cookieParser());

const publicDir = path.join(__dirname, "..", "frontend");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(publicDir));

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, {recursive:true});

const storage = multer.diskStorage({
  destination: (_,__,cb)=>cb(null,uploadDir),
  filename: (_,file,cb)=>{
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g,"_");
    cb(null, Date.now()+"-"+safe);
  }
});
const upload = multer({
  storage,
  limits:{files:5, fileSize:4*1024*1024},
  fileFilter: (_,file,cb)=>{
    if (/^(image|video)\//.test(file.mimetype)) cb(null,true);
    else cb(new Error("Only image/video evidence is allowed."));
  }
});

const complaintSchema = new mongoose.Schema({
  complaintId:{type:String,unique:true,index:true},
  name:{type:String,required:true,trim:true},
  mobile:{type:String,required:true},
  email:{type:String,default:""},
  category:{type:String,required:true},
  incidentDate:{type:String,required:true},
  amount:{type:String,default:""},
  transaction:{type:String,default:""},
  description:{type:String,required:true},
  evidence:[{name:String,url:String}],
  status:{type:String,enum:["Submitted","Under Review","Investigation","Resolved"],default:"Submitted"},
  remark:{type:String,default:"Complaint has been submitted successfully."},
  lastUpdated:{type:Date,default:Date.now}
},{timestamps:true});

const feedbackSchema = new mongoose.Schema({
  name:{type:String,required:true},
  rating:{type:Number,min:1,max:5,required:true},
  text:{type:String,required:true}
},{timestamps:true});

const suspiciousSchema = new mongoose.Schema({
  name:{type:String,required:true},
  type:{type:String,required:true},
  source:{type:String,default:""},
  details:{type:String,required:true}
},{timestamps:true});

const Complaint = mongoose.model("Complaint", complaintSchema);
const Feedback = mongoose.model("Feedback", feedbackSchema);
const Suspicious = mongoose.model("Suspicious", suspiciousSchema);

function auth(req,res,next){
  const token=req.cookies.cyber_admin;
  if(!token) return res.status(401).json({message:"Admin login required"});
  try {
    req.admin=jwt.verify(token,JWT_SECRET);
    next();
  } catch {
    res.status(401).json({message:"Admin session expired"});
  }
}

app.get("/api/health", (_,res)=>res.json({ok:true}));

app.post("/api/auth/login", async (req,res)=>{
  try {
    const {email,password}=req.body;
    if(email !== ADMIN_EMAIL || !(await bcrypt.compare(password || "", ADMIN_PASSWORD_HASH))){
      return res.status(401).json({message:"Invalid credentials"});
    }
    const token=jwt.sign({email,role:"admin"},JWT_SECRET,{expiresIn:"8h"});
    res.cookie("cyber_admin",token,{
      httpOnly:true,
      sameSite:"lax",
      secure:process.env.NODE_ENV==="production",
      maxAge:8*60*60*1000
    });
    res.json({ok:true});
  } catch { res.status(500).json({message:"Login failed"}); }
});

app.post("/api/auth/logout",(req,res)=>{
  res.clearCookie("cyber_admin");
  res.json({ok:true});
});

app.get("/api/auth/me",auth,(req,res)=>res.json({ok:true,admin:{email:req.admin.email}}));

app.post("/api/complaints",upload.array("evidence",5),async(req,res)=>{
  try {
    const id="CYB"+Math.floor(100000+Math.random()*900000);
    const c=await Complaint.create({
      complaintId:id,
      name:req.body.name,
      mobile:req.body.mobile,
      email:req.body.email || "",
      category:req.body.category,
      incidentDate:req.body.incidentDate,
      amount:req.body.amount || "",
      transaction:req.body.transaction || "",
      description:req.body.description,
      evidence:(req.files||[]).map(f=>({name:f.originalname,url:"/uploads/"+f.filename}))
    });
    res.status(201).json({complaint:{
      id:c.complaintId,
      name:c.name,
      status:c.status,
      remark:c.remark
    }});
  } catch(err) {
    res.status(400).json({message:err.message || "Complaint submission failed"});
  }
});

app.get("/api/complaints/:id",async(req,res)=>{
  const c=await Complaint.findOne({complaintId:req.params.id.toUpperCase()}).lean();
  if(!c) return res.status(404).json({message:"Complaint not found"});
  res.json({complaint:{
    id:c.complaintId,name:c.name,category:c.category,incidentDate:c.incidentDate,
    date:c.createdAt,status:c.status,remark:c.remark
  }});
});

app.post("/api/suspicious",async(req,res)=>{
  try { await Suspicious.create(req.body); res.status(201).json({ok:true}); }
  catch(err){ res.status(400).json({message:err.message}); }
});

app.post("/api/feedback",async(req,res)=>{
  try {
    await Feedback.create({name:req.body.name,rating:Number(req.body.rating),text:req.body.text});
    res.status(201).json({ok:true});
  } catch(err){ res.status(400).json({message:err.message}); }
});

app.get("/api/admin/complaints",auth,async(_,res)=>{
  const complaints=await Complaint.find().sort({createdAt:-1}).lean();
  res.json({complaints:complaints.map(c=>({
    id:c.complaintId,name:c.name,category:c.category,incidentDate:c.incidentDate,
    status:c.status,remark:c.remark,date:c.createdAt
  }))});
});

app.get("/api/admin/dashboard",auth,async(_,res)=>{
  const [complaints,feedback]=await Promise.all([
    Complaint.find().sort({createdAt:-1}).lean(),
    Feedback.find().sort({createdAt:-1}).lean()
  ]);
  const stats={
    total:complaints.length,
    submitted:complaints.filter(c=>c.status==="Submitted").length,
    review:complaints.filter(c=>c.status==="Under Review").length,
    investigation:complaints.filter(c=>c.status==="Investigation").length,
    resolved:complaints.filter(c=>c.status==="Resolved").length
  };
  res.json({
    stats,
    complaints:complaints.map(c=>({
      id:c.complaintId,name:c.name,category:c.category,incidentDate:c.incidentDate,
      status:c.status,remark:c.remark,date:c.createdAt
    })),
    feedback:feedback.map(f=>({name:f.name,rating:f.rating,text:f.text,date:f.createdAt}))
  });
});

app.patch("/api/admin/complaints/:id",auth,async(req,res)=>{
  const allowed=["Submitted","Under Review","Investigation","Resolved"];
  if(!allowed.includes(req.body.status)) return res.status(400).json({message:"Invalid status"});
  const remarks={
    "Submitted":"Complaint has been submitted successfully.",
    "Under Review":"Complaint is currently under review.",
    "Investigation":"Investigation is currently in progress.",
    "Resolved":"Complaint has been resolved."
  };
  const c=await Complaint.findOneAndUpdate(
    {complaintId:req.params.id},
    {$set:{status:req.body.status,remark:remarks[req.body.status],lastUpdated:new Date()}},
    {new:true}
  );
  if(!c) return res.status(404).json({message:"Complaint not found"});
  res.json({ok:true});
});

app.delete("/api/admin/complaints/:id",auth,async(req,res)=>{
  const c=await Complaint.findOneAndDelete({complaintId:req.params.id});
  if(!c) return res.status(404).json({message:"Complaint not found"});
  res.json({ok:true});
});

app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError) return res.status(400).json({message:err.message});
  if(err) return res.status(400).json({message:err.message || "Request failed"});
  next();
});

mongoose.connect(MONGO_URI)
  .then(()=>app.listen(PORT,()=>console.log(`CyberShield server running on http://localhost:${PORT}`)))
  .catch(err=>{console.error("MongoDB connection failed:",err.message);process.exit(1);});

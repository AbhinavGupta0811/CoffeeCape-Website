const params = new URLSearchParams(window.location.search);
const type = params.get("type") || "server";

const errorConfig = {

  payment:{
    code:"PAYMENT FAILED",
    title:"Payment Unsuccessful",
    message:"Your transaction could not be completed. Please try again."
  },

  unauthorized:{
    code:"401",
    title:"Unauthorized Access",
    message:"You must login to access this page."
  },

  forbidden:{
    code:"403",
    title:"Access Forbidden",
    message:"You don’t have permission to view this resource."
  },

  notfound:{
    code:"404",
    title:"Page Not Found",
    message:"The page you’re looking for doesn’t exist."
  },

  server:{
    code:"500",
    title:"Server Error",
    message:"Something went wrong on our side."
  },

  network:{
    code:"NETWORK ERROR",
    title:"Connection Lost",
    message:"Please check your internet connection."
  }

};

const config = errorConfig[type] || errorConfig.server;

document.getElementById("errorCode").textContent = config.code;
document.getElementById("errorTitle").textContent = config.title;
document.getElementById("errorMessage").textContent = config.message;

/* ========================
   BUTTONS
======================== */

function goHome(){
  window.location.href="index.html";
}

function goBack(){
  history.back();
}
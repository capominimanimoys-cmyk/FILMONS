# 🔧 Quick Fix for "recipients address is empty" Error

## The Problem
EmailJS doesn't know where to send the email because the **"To Email"** field is not configured in your template settings.

## ✅ The Solution (Takes 2 minutes)

### Step 1: Go to EmailJS Dashboard
1. Open: https://dashboard.emailjs.com/admin
2. Click on **Email Templates** in the left sidebar
3. Find template: `template_ylwv48p`
4. Click **Edit**

### Step 2: Configure the "To Email" Field (MOST IMPORTANT!)

At the TOP of the template editor, you'll see several fields:

```
┌─────────────────────────────────────────────────┐
│ To Email:     {{to_email}}          ← ENTER THIS│
│ From Name:    Filmons                           │
│ From Email:   (your service email)              │
│ Subject:      Your Filmons Verification Code    │
└─────────────────────────────────────────────────┘
```

**In the "To Email" field, type exactly:**
```
{{to_email}}
```

This tells EmailJS: "Use the `to_email` parameter from the code as the recipient's email address"

### Step 3: Optionally Update Subject Line
```
Subject: Your Filmons Verification Code 🔐
```

### Step 4: Save the Template
Click the **Save** button at the bottom

### Step 5: Test It!
Go back to your Filmons verification page and try sending a code again. It should work now! ✅

---

## 📋 Complete Template Settings Reference

Here's what your template settings should look like:

| Field | Value |
|-------|-------|
| **To Email** | `{{to_email}}` ← **CRITICAL!** |
| **From Name** | `Filmons` or `Filmons Team` |
| **From Email** | (Auto-configured by your EmailJS service) |
| **Subject** | `Your Filmons Verification Code` or `Your Filmons Verification Code 🔐` |
| **BCC** | (Leave empty unless needed) |
| **Reply To** | (Optional: your support email) |

---

## 🎯 Why This Happens

EmailJS separates:
1. **Template Settings** (Who receives, subject line, etc.) ← This is where `{{to_email}}` goes
2. **Template Content** (The HTML body of the email) ← This is where `{{verification_code}}` and `{{to_name}}` go

The error occurs when the "To Email" field in settings is empty or hardcoded.

---

## ✅ Verification Checklist

After making changes, verify:
- [ ] "To Email" field contains `{{to_email}}`
- [ ] Template ID is `template_ylwv48p`
- [ ] Service ID is `service_s6wwjtj`
- [ ] Template is saved
- [ ] Test sending a verification code

---

## 🆘 Still Having Issues?

### Error: "recipients address is empty"
✅ **Fix**: Add `{{to_email}}` to the "To Email" field in template settings

### Error: "template not found"
✅ **Fix**: Verify template ID is `template_ylwv48p` in both EmailJS dashboard and code

### Error: "public key invalid"
✅ **Fix**: Check that public key `iSSpIM-AeV9uUQ7Jt` matches your EmailJS account

### Emails not arriving
✅ **Fix**: Check spam folder, verify email service is active in EmailJS dashboard

---

## 📧 Need to Configure Verification Submission Template Too?

For the final submission template (`template_ryty7se`), configure:

```
To Email: filmons481@gmail.com
From Name: Filmons Verification System
Subject: New Host Verification Request - {{user_name}}
```

This template sends verification submissions to the Filmons team, so the recipient email is hardcoded to `filmons481@gmail.com`.

---

**That's it!** Your email verification should work now. 🎉

# 🔧 EmailJS Error 422: "recipients address is empty" - Complete Fix

## The Root Cause
EmailJS templates have TWO parts:
1. **Template Settings** (at the top) - This is where you specify WHO receives the email
2. **Template Content** (below) - This is the HTML/text body

The error occurs because the **"To Email"** field in Template Settings is not configured.

---

## ✅ EXACT Steps to Fix (Follow Carefully)

### Step 1: Login to EmailJS
1. Go to: https://dashboard.emailjs.com/
2. Login with your account

### Step 2: Navigate to Templates
1. Click **"Email Templates"** in the left sidebar
2. You should see a list of your templates

### Step 3: Find and Edit the Template
1. Look for template ID: **template_ylwv48p**
2. Click the **"Edit"** button (or click on the template name)

### Step 4: Configure Template Settings (CRITICAL!)

You'll see a form at the TOP with these fields:

```
┌──────────────────────────────────────────┐
│  Template Settings                       │
├──────────────────────────────────────────┤
│  Template Name: [Verification Code]      │
│                                          │
│  To Email: [THIS MUST NOT BE EMPTY]     │  ← FIX THIS!
│            └→ Type: {{to_email}}         │
│                                          │
│  From Name: [Filmons]                    │
│                                          │
│  Subject: [Your Filmons Verification]    │
│                                          │
└──────────────────────────────────────────┘
```

**In the "To Email" field, you MUST type:**
```
{{to_email}}
```

### Step 5: Scroll Down to Content Section
Below the settings, you'll see the email content/HTML area. You can paste the HTML template there (optional for now).

### Step 6: SAVE THE TEMPLATE
1. Scroll to the bottom
2. Click the **"Save"** button
3. Wait for confirmation message

### Step 7: Test Again
Go back to Filmons verification page and try sending the code again.

---

## 🎯 Visual Guide - What It Should Look Like

**BEFORE (Wrong - Causes Error 422):**
```
To Email: [________________]  ← EMPTY = ERROR!
```

**AFTER (Correct):**
```
To Email: [{{to_email}}____]  ← Has {{to_email}} = Works!
```

---

## 🧪 Alternative: Test with Hardcoded Email First

If you want to test that EmailJS is working at all, try this:

### Temporary Test Configuration:
1. In the "To Email" field, enter YOUR actual email: `your.email@gmail.com`
2. Save the template
3. Try sending a code from Filmons
4. Check if you receive the email (it will go to YOUR email instead of the user's)
5. Once confirmed working, change "To Email" back to `{{to_email}}`

This helps confirm:
- ✅ EmailJS service is working
- ✅ Template exists
- ✅ API keys are correct
- ❌ Just need to configure dynamic recipient

---

## 📸 Screenshot Reference

When editing the template, you should see something like this:

```
┌─────────────────────────────────────────────────────────┐
│ Edit Template: template_ylwv48p                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Template Name                                           │
│ [Verification Code________________________]             │
│                                                         │
│ To Email                                  ← IMPORTANT! │
│ [{{to_email}}___________________________]             │
│                                                         │
│ To Name (optional)                                      │
│ [{{to_name}}____________________________]             │
│                                                         │
│ From Name                                               │
│ [Filmons________________________________]             │
│                                                         │
│ Reply To (optional)                                     │
│ [_______________________________________]             │
│                                                         │
│ Subject                                                 │
│ [Your Filmons Verification Code__________]             │
│                                                         │
│ ─────────────────────────────────────────              │
│                                                         │
│ Content (Email Body)                                    │
│ ┌──────────────────────────────────────┐               │
│ │ Hi {{to_name}},                      │               │
│ │                                      │               │
│ │ Your code: {{verification_code}}     │               │
│ │                                      │               │
│ └──────────────────────────────────────┘               │
│                                                         │
│                    [Save Template]                      │
└─────────────────────────────────────────────────────────┘
```

---

## ❓ Still Not Working? Check These:

### 1. Template ID is Correct
- In EmailJS dashboard, verify template ID is exactly: `template_ylwv48p`
- Check for typos or extra spaces

### 2. Service is Active
- Go to "Email Services" in EmailJS dashboard
- Make sure service `service_s6wwjtj` is active and connected

### 3. API Keys Match
- Public Key should be: `iSSpIM-AeV9uUQ7Jt`
- Check this matches in EmailJS "Account" settings

### 4. Clear Browser Cache
- Sometimes EmailJS caches old template configurations
- Try in an incognito/private browser window

### 5. Wait a Few Minutes
- EmailJS sometimes takes 1-2 minutes to propagate template changes
- Save the template, wait 2 minutes, then test again

---

## 🆘 Nuclear Option: Create New Template

If nothing works, create a fresh template:

1. In EmailJS, click **"Create New Template"**
2. Name it: "Filmons Email Verification"
3. Set **To Email**: `{{to_email}}`
4. Set **From Name**: `Filmons`
5. Set **Subject**: `Your Filmons Verification Code`
6. In Content, paste a simple message:
   ```
   Hi {{to_name}},
   
   Your verification code is: {{verification_code}}
   
   Thanks,
   Filmons Team
   ```
7. Click **Save**
8. Copy the new template ID (e.g., `template_xyz123`)
9. Update `/src/app/lib/emailjs-config.ts`:
   ```typescript
   emailVerification: 'template_xyz123', // ← new template ID
   ```

---

## 📞 Need More Help?

If you're still stuck, please check:
1. Can you see the template in EmailJS dashboard?
2. Does it have a template ID?
3. Can you click "Edit" on it?
4. Do you see the "To Email" field at the top?

The fix is 100% in the EmailJS dashboard configuration, not in the code! ✅

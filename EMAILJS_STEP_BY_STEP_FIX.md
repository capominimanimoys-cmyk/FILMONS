# 🔧 EXACT Steps to Fix EmailJS Error 422

## Current Issue
Error: `"The recipients address is empty"`

This means template `template_p5pgn33` exists, but the "To Email" field is NOT configured.

---

## ✅ FOLLOW THESE EXACT STEPS:

### 1️⃣ Open EmailJS Dashboard
- Go to: **https://dashboard.emailjs.com/admin/templates**
- You should see a list of your templates

### 2️⃣ Find Template: template_p5pgn33
- Look for template ID: `template_p5pgn33`
- Click the **EDIT** button (or click the template name)

### 3️⃣ You'll See This Form Layout:

```
┌─────────────────────────────────────────────────────┐
│  📝 Template Settings (TOP OF PAGE)                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Template Name                                      │
│  [_____________________________________________]   │
│                                                     │
│  ⚠️ To Email          ← THIS IS THE PROBLEM!      │
│  [_____________________________________________]   │  �� CURRENTLY EMPTY!
│     ↑ Type: {{to_email}} here                      │
│                                                     │
│  To Name (optional)                                 │
│  [_____________________________________________]   │
│                                                     │
│  From Name                                          │
│  [_____________________________________________]   │
│                                                     │
│  Reply To (optional)                                │
│  [_____________________________________________]   │
│                                                     │
│  Subject                                            │
│  [_____________________________________________]   │
│                                                     │
└─────────────────────────────────────────────────────┘

(Scroll down to see email body/content...)
```

### 4️⃣ Fix the "To Email" Field

**IN THE "TO EMAIL" FIELD, TYPE EXACTLY:**
```
{{to_email}}
```

**IMPORTANT:** 
- Type it with TWO curly braces on each side: `{{to_email}}`
- No spaces inside the braces
- All lowercase
- Don't type anything else in that field

### 5️⃣ Optional: Fill Other Fields

You can also fill these (optional but recommended):

**To Name:**
```
{{to_name}}
```

**From Name:**
```
Filmons
```

**Subject:**
```
Your Filmons Verification Code
```

### 6️⃣ Scroll Down to Email Body/Content

Below the settings, you'll see a text area for the email body. Paste this:

```
Hi {{to_name}},

Your verification code is: {{verification_code}}

This code will expire in 10 minutes.

Thanks,
Filmons Team
```

### 7️⃣ SAVE THE TEMPLATE

**CRITICAL:** 
- Scroll to the bottom of the page
- Click the **"SAVE"** button
- Wait for the success message

### 8️⃣ Wait 30 Seconds

EmailJS needs a moment to update the template configuration.

### 9️⃣ Test Again

- Go back to Filmons
- Try sending the verification code again
- It should work now! ✅

---

## 🎯 What You Should See (Before & After)

### ❌ BEFORE (Causes Error 422):
```
To Email: [                    ] ← EMPTY = ERROR!
```

### ✅ AFTER (Works):
```
To Email: [{{to_email}}        ] ← Has {{to_email}} = SUCCESS!
```

---

## 🆘 Still Not Working?

### Double-Check These:

1. **Did you type `{{to_email}}` exactly?**
   - ✅ Correct: `{{to_email}}`
   - ❌ Wrong: `{ {to_email} }`
   - ❌ Wrong: `{{To_Email}}`
   - ❌ Wrong: `to_email`

2. **Did you click SAVE?**
   - The template must be saved for changes to apply

3. **Did you wait 30 seconds?**
   - EmailJS caches template configurations

4. **Are you editing the correct template?**
   - Template ID must be: `template_p5pgn33`

### If Still Stuck:

Take a screenshot of:
1. The EmailJS template editing page (showing the "To Email" field)
2. The browser console error message

This will help diagnose the exact issue!

---

## 📱 Quick Checklist

Before testing again, confirm:

- [ ] I'm logged into EmailJS dashboard
- [ ] I found template: `template_p5pgn33`
- [ ] I clicked "Edit" on that template
- [ ] I typed `{{to_email}}` in the "To Email" field (at the top)
- [ ] I clicked "Save" at the bottom
- [ ] I waited 30 seconds
- [ ] I'm now testing in Filmons

---

## 🎉 Success!

Once you see "✅ Email verification code sent successfully!" in the console, you're done!

The email should arrive in your inbox within a few seconds.

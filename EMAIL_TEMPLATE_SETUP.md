# Email Verification Template Setup Guide

This guide will help you set up the HTML email template for email verification in your EmailJS account.

## 📧 Template Location

The HTML template is located at:
```
/src/app/templates/email-verification-template.html
```

## 🔧 EmailJS Setup Instructions

### Step 1: Access EmailJS Dashboard
1. Go to [EmailJS Dashboard](https://dashboard.emailjs.com/)
2. Log in to your account
3. Navigate to **Email Templates**

### Step 2: Update Existing Template (IMPORTANT!)
1. Find the template with ID: `template_ylwv48p`
2. Click **Edit** on this template

### Step 3: Configure Template Settings (CRITICAL - Fixes "recipients address is empty" error)

**BEFORE doing anything else, you MUST configure the recipient email address:**

1. In the template editor, find the **"To Email"** field at the top
2. Enter: `{{to_email}}`
3. This tells EmailJS to use the `to_email` parameter from the code as the recipient

**Screenshot reference:**
```
To Email: {{to_email}}
From Name: Filmons
From Email: your-emailjs-sender@email.com (configured in your service)
Subject: Your Filmons Verification Code
```

### Step 4: Copy Template Content
1. Open `/src/app/templates/email-verification-template.html`
2. Copy the entire HTML content
3. Paste it into the EmailJS template editor (in the Content section below the settings)

### Step 5: Configure Template Variables
Make sure these variables are properly configured:

| Variable Name | Description | Used In | Example |
|--------------|-------------|---------|---------|
| `{{to_email}}` | **Recipient's email (REQUIRED in "To Email" field)** | Template Settings | "user@example.com" |
| `{{to_name}}` | Recipient's name | Email Body | "John Doe" |
| `{{verification_code}}` | 6-digit verification code | Email Body | "123456" |

### Step 6: Test the Template
1. Use EmailJS's **Test** feature
2. Enter sample values:
   - `to_name`: "Test User"
   - `verification_code`: "123456"
3. Send a test email to verify formatting

### Step 7: Save and Deploy
1. Click **Save** in EmailJS
2. The template is now live and ready to use!

## 📋 Template Features

✅ **Modern Design** - Professional gradient header with Filmons branding  
✅ **Large Verification Code** - Easy-to-read 48px code with monospace font  
✅ **Security Notice** - 10-minute expiration warning  
✅ **Mobile Responsive** - Optimized for all devices  
✅ **Clear Call-to-Action** - Prominent verification code display  
✅ **Benefits Listed** - Shows value of verification  

## 🎨 Template Preview

The template includes:
- **Header**: Blue gradient with Filmons logo 🎬
- **Verification Code Box**: Large, centered 6-digit code
- **Security Information**: Expiration notice and tips
- **Benefits Section**: Why users should verify
- **Footer**: Branding and copyright information

## 🔄 Template Variables Used in Code

The verification page (`/src/app/pages/Verification.tsx`) sends these parameters:

```javascript
{
  to_name: fullName || user?.name || 'User',
  to_email: emailAddress,
  verification_code: code,
  user_name: fullName || user?.name || 'User',
}
```

## 📝 Notes

- The template ID `template_ylwv48p` is already configured in the code
- Make sure to keep the same template ID in EmailJS
- The service ID is `service_s6wwjtj`
- The public key is `iSSpIM-AeV9uUQ7Jt`

## 🆘 Troubleshooting

**Problem**: Email not sending
- Check that template ID matches in EmailJS and code
- Verify service is active in EmailJS dashboard
- Check browser console for error messages

**Problem**: Variables not showing
- Ensure variable names match exactly (case-sensitive)
- Use double curly braces: `{{variable_name}}`

**Problem**: Styling not working
- EmailJS may strip some CSS - test thoroughly
- Use inline styles as backup for critical styling

## 🎯 Alternative: Create New Template

If you prefer to create a new template instead:

1. Create a new template in EmailJS
2. Copy the new template ID (e.g., `template_abc123`)
3. Update `/src/app/pages/Verification.tsx`:
   ```typescript
   await emailjs.send(
     'service_s6wwjtj',
     'template_abc123',  // ← Change this
     templateParams,
     'iSSpIM-AeV9uUQ7Jt'
   );
   ```

---

**Ready to test?** Send a verification email and check your inbox! 📬✨
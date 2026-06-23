// SMS Service using Twilio
// Note: For production use, this should be handled server-side to protect API credentials

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

// Twilio configuration - Replace with your actual credentials
const TWILIO_CONFIG: TwilioConfig = {
  accountSid: 'YOUR_TWILIO_ACCOUNT_SID', // Get from https://www.twilio.com/console
  authToken: 'YOUR_TWILIO_AUTH_TOKEN',   // Get from https://www.twilio.com/console
  fromNumber: '+1234567890',              // Your Twilio phone number
};

export const sendSMS = async (to: string, message: string): Promise<boolean> => {
  try {
    // Check if Twilio credentials are configured
    if (
      TWILIO_CONFIG.accountSid === 'YOUR_TWILIO_ACCOUNT_SID' ||
      TWILIO_CONFIG.authToken === 'YOUR_TWILIO_AUTH_TOKEN'
    ) {
      console.warn('⚠️ Twilio credentials not configured. SMS not sent.');
      console.log('📱 SMS would be sent to:', to);
      console.log('📄 Message:', message);
      // Return true to allow testing without actual SMS
      return true;
    }

    // Format phone number to E.164 format if needed
    const formattedPhone = to.startsWith('+') ? to : `+${to}`;

    // Twilio REST API endpoint
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_CONFIG.accountSid}/Messages.json`;

    // Create form data for Twilio API
    const params = new URLSearchParams();
    params.append('To', formattedPhone);
    params.append('From', TWILIO_CONFIG.fromNumber);
    params.append('Body', message);

    // Basic authentication header
    const auth = btoa(`${TWILIO_CONFIG.accountSid}:${TWILIO_CONFIG.authToken}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Twilio API Error:', errorData);
      throw new Error(`Failed to send SMS: ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ SMS sent successfully:', data.sid);
    return true;
  } catch (error) {
    console.error('❌ Failed to send SMS:', error);
    return false;
  }
};

export const sendVerificationCodeSMS = async (phone: string, code: string, userName: string): Promise<boolean> => {
  const message = `Hi ${userName}! Your Filmons verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\n- Filmons Team`;
  return sendSMS(phone, message);
};

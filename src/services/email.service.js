import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,

  auth: {
    user: process.env.SUPPPORT_EMAIL,
    pass: process.env.SUPPORT_EMAIL_PASSWORD,
  },

  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});
export const sendVerificationEmail = async (email, code) => {
  await transporter.sendMail({
    from: `"FieldProof" <${process.env.SUPPORT_EMAIL}>`,

    to: email,

    subject: "Verify your FieldProof email",

    html: `
  <div style="
    margin: 0;
    padding: 40px 20px;
    background: #080c16;
    font-family: Arial, Helvetica, sans-serif;
  ">

    <div style="
      max-width: 560px;
      margin: 0 auto;
      background: #0f1625;
      border: 1px solid #1e293b;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0,0,0,0.35);
    ">

      <!-- Header -->
      <div style="
        padding: 32px 35px 26px;
        text-align: center;
        border-bottom: 1px solid #1e293b;
      ">

        <div style="
          width: 58px;
          height: 58px;
          margin: 0 auto 18px;
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          border-radius: 16px;
          line-height: 58px;
          font-size: 25px;
          font-weight: bold;
          color: #ffffff;
          box-shadow: 0 10px 25px rgba(14,165,233,0.25);
        ">
          F
        </div>

        <h1 style="
          margin: 0;
          color: #f8fafc;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.5px;
        ">
          FieldProof
        </h1>

        <p style="
          margin: 8px 0 0;
          color: #64748b;
          font-size: 13px;
        ">
          Secure workforce management
        </p>

      </div>

      <!-- Content -->
      <div style="
        padding: 38px 35px;
        text-align: center;
      ">

        <div style="
          display: inline-block;
          padding: 7px 13px;
          margin-bottom: 18px;
          background: rgba(14,165,233,0.10);
          border: 1px solid rgba(14,165,233,0.20);
          border-radius: 999px;
          color: #38bdf8;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.5px;
        ">
          EMAIL VERIFICATION
        </div>

        <h2 style="
          margin: 0 0 12px;
          color: #f8fafc;
          font-size: 25px;
          line-height: 1.3;
          font-weight: 700;
        ">
          Verify your email address
        </h2>

        <p style="
          max-width: 420px;
          margin: 0 auto;
          color: #94a3b8;
          font-size: 14px;
          line-height: 1.7;
        ">
          Thanks for joining FieldProof. Enter the verification code below
          to securely activate your account.
        </p>

        <!-- Verification Code -->
        <div style="
          margin: 30px 0;
          padding: 24px 20px;
          background: #080c16;
          border: 1px solid #243044;
          border-radius: 18px;
        ">

          <p style="
            margin: 0 0 12px;
            color: #64748b;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 1.5px;
          ">
            YOUR VERIFICATION CODE
          </p>

          <div style="
            color: #38bdf8;
            font-size: 36px;
            font-weight: 800;
            letter-spacing: 9px;
            line-height: 1;
          ">
            ${code}
          </div>

        </div>

        <!-- Expiry -->
        <div style="
          padding: 13px 16px;
          background: rgba(245,158,11,0.07);
          border: 1px solid rgba(245,158,11,0.15);
          border-radius: 12px;
          color: #fbbf24;
          font-size: 12px;
          line-height: 1.5;
        ">
          ⏱ This verification code expires in <strong>10 minutes</strong>.
        </div>

      </div>

      <!-- Footer -->
      <div style="
        padding: 22px 30px;
        background: #0b111e;
        border-top: 1px solid #1e293b;
        text-align: center;
      ">

        <p style="
          margin: 0 0 8px;
          color: #64748b;
          font-size: 11px;
          line-height: 1.6;
        ">
          If you didn't create a FieldProof account,
          you can safely ignore this email.
        </p>

        <p style="
          margin: 0;
          color: #475569;
          font-size: 10px;
        ">
          © FieldProof • Secure & Reliable
        </p>

      </div>

    </div>

  </div>
`,
  });
};
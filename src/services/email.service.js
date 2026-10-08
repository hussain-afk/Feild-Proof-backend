import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "in-v3.mailjet.com",
  port: 2525,
  secure: false,

  auth: {
    user: process.env.MAILJET_API_KEY,
    pass: process.env.MAILJET_SECRET_KEY,
  },

  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

export const sendVerificationEmail = async (email, code) => {
  try {
    const info = await transporter.sendMail({
      from: `"FieldProof" <muhammadhussainmemon2566@gmail.com>`,

      to: email,

      subject: "Verify your FieldProof account",

      html: `
        <div style="
          margin: 0;
          padding: 40px 20px;
          font-family: Arial, Helvetica, sans-serif;
        ">

          <div style="
            max-width: 560px;
            margin: 0 auto;
            background: #0f1625;
            border: 1px solid #1e293b;
            border-radius: 24px;
            overflow: hidden;
          ">

            <!-- Header -->
            <div style="
              padding: 32px;
              text-align: center;
              border-bottom: 1px solid #1e293b;
            ">

              <div style="
                width: 58px;
                height: 58px;
                margin: 0 auto 18px;
                background: #0ea5e9;
                border-radius: 16px;
                line-height: 58px;
                font-size: 25px;
                font-weight: bold;
                color: white;
              ">
                F
              </div>

              <h1 style="
                margin: 0;
                color: #f8fafc;
                font-size: 24px;
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
                background: #082f49;
                border: 1px solid #075985;
                border-radius: 999px;
                color: #38bdf8;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 1px;
              ">
                EMAIL VERIFICATION
              </div>

              <h2 style="
                margin: 0 0 12px;
                color: #f8fafc;
                font-size: 25px;
                line-height: 1.3;
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
                Thanks for joining FieldProof.
                Enter the verification code below
                to securely activate your account.
              </p>

              <!-- Code -->
              <div style="
                margin: 30px 0;
                padding: 24px 20px;
                background: #080c16;
                border: 1px solid #243044;
                border-radius: 18px;
              ">

                <p style="
                  margin: 0 0 14px;
                  color: #64748b;
                  font-size: 10px;
                  font-weight: 700;
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
                background: #1c1607;
                border: 1px solid #45340a;
                border-radius: 12px;
                color: #fbbf24;
                font-size: 12px;
              ">
                ⏱ This verification code expires in
                <strong>10 minutes</strong>.
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

    console.log("Verification email sent:", info.messageId);

    return info;
  } catch (error) {
    console.error("Email sending error:", error);

    throw new Error(
      error?.message || "Failed to send verification email"
    );
  }
};
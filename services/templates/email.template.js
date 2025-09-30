/**
 * Generates HTML for report notification email
 * @param {Object} params
 * @param {string} params.clientName - Name of the client
 * @param {string} params.reportTitle - Title of the report
 * @param {string} params.portalLink - Link to the portal
 * @param {string} params.logoUrl - Optional: URL of the company logo
 * @returns {string} HTML content
 */
function generateReportEmail({ clientName, reportTitle, portalLink, logoUrl }) {
  const brandColor = "#8ea8ffff"; // primary branding color
  const ctaColor = "#1E40AF";
  const footerText = "© 2025 Ativa IT Solutions. All rights reserved.";

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>${reportTitle} Notification</title>
  </head>
  <body style="font-family: Arial, sans-serif; margin:0; padding:0; background:#f9f9f9;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9; padding: 20px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
            <!-- Header -->
            <tr>
              <td style="background:${brandColor}; padding:20px; text-align:center;">
                ${logoUrl ? `<img src="${logoUrl}" alt="Logo" width="120" style="display:block; margin:0 auto;">` : '<img src="https://ativaitsolutions.com/wp-content/uploads/2024/08/Ativa-Logo-Png-1.png" alt="Logo" width="120" style="display:block; margin:0 auto;">'}
                <h1 style="color:#1E40AF; font-size:20px; margin:10px 0 0;">New Report Uploaded</h1>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:30px;">
                <p style="font-size:16px; color:#333;">Hello <strong>${clientName}</strong>,</p>
                <p style="font-size:16px; color:#333;">Your report <strong>${reportTitle}</strong> has been uploaded to the portal.</p>
                <p style="text-align:center; margin:30px 0;">
                  <a href="${portalLink}" style="background:${ctaColor}; color:#ffffff; text-decoration:none; padding:12px 25px; border-radius:5px; font-size:16px;">View Report</a>
                </p>
                <p style="font-size:14px; color:#666;">If you have any questions, feel free to contact us.</p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f0f0f0; padding:15px; text-align:center; font-size:12px; color:#888;">
                ${footerText}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

module.exports = { generateReportEmail };

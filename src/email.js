export async function sendEmail(env, toEmail, toName, subject, htmlContent) {
    if (env.ENABLE_EMAILS !== 'true') {
        console.log(`[EMAIL DISABLED] Simulating mail to: ${toEmail} | Subject: ${subject}`);
        return true;
    }

    const emailPayload = {
        sender: { name: "rezervace@tjsbfotbal.cz", email: "rezervace@tjsbfotbal.cz" },
        to: [{ email: toEmail, name: toName }],
        replyTo: { email: "noreply@tjsbfotbal.cz", name: "Neodpovídejte / Automat" },
        subject: subject,
        htmlContent: htmlContent
    };

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': env.BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify(emailPayload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("[BREVO ERROR]", errorData);
            return false;
        }

        return true;
    } catch (e) {
        console.error("[BREVO EXCEPTION] Email send failed with Brevo API:", e);
        return false;
    }
}

// ============================================
// Order confirmation template
// ============================================
export async function sendOrderConfirmation(env, orderId, name, email, phone, items, cancelLink) {
    const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const itemsListHtml = items.map(i =>
        `<li style="padding: 10px 0; border-bottom: 1px solid #eee;">
            <strong>${i.quantity}x ${i.name}</strong> ${i.size ? `<span style="color: #666; font-size: 0.9em;">(Velikost: ${i.size})</span>` : ''}
            <div style="float: right; font-weight: bold;">${i.price * i.quantity} Kč</div>
        </li>`
    ).join('');

    const subject = `Potvrzení rezervace - TJ Sokol Bohuňovice`;

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <div style="background-color: #111a3b; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: #ffd700; margin: 0; text-transform: uppercase; font-size: 24px;">Rezervace přijata!</h1>
            </div>
            <div style="padding: 30px 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px;">
                <p>Ahoj ${name},</p>
                <p>díky za tvou rezervaci týmového merche. Tvůj požadavek jsme v pořádku zapsali do systému.</p>
                
                <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #3498db; margin: 25px 0;">
                    <strong style="display: block; margin-bottom: 5px;">Jak to bude probíhat dál?</strong>
                    Jakmile pro tebe věci nachystáme, dáme ti vědět e-mailem nebo na tvůj telefon. <strong>Vyzvednutí pak probíhá vždy osobně u nás na hřišti.</strong>
                </div>

                <h3 style="border-bottom: 2px solid #111a3b; padding-bottom: 5px; color: #111a3b;">Tvoje údaje</h3>
                <p style="margin: 5px 0;"><strong>Jméno:</strong> ${name}</p>
                <p style="margin: 5px 0;"><strong>Telefon:</strong> ${phone}</p>

                <h3 style="border-bottom: 2px solid #111a3b; padding-bottom: 5px; margin-top: 30px; color: #111a3b;">Shrnutí rezervace</h3>
                <ul style="list-style-type: none; padding: 0; margin: 0;">
                    ${itemsListHtml}
                </ul>
                <div style="text-align: right; font-size: 1.3em; margin-top: 20px; color: #111a3b;">
                    <strong>Celkem k úhradě: ${totalPrice} Kč</strong>
                </div>

                <hr style="border: none; border-top: 1px dashed #ccc; margin: 40px 0 20px 0;">
                <p style="font-size: 12px; color: #888; text-align: center; margin: 0;">
                    Změnily se ti plány? Svou rezervaci můžeš stornovat kliknutím na odkaz níže:<br>
                    <a href="${cancelLink}" style="color: #dc3545; font-weight: bold; display: inline-block; margin-top: 10px;">Zrušit rezervaci</a>
                </p>
                <div style="background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 11px; color: #999; border-radius: 4px;">
                    Toto je automaticky generovaná zpráva, prosíme, neodpovídejte na ni. V případě dotazů se nám ozvěte na naše oficiální kontakty.
                </div>
            </div>
        </div>
    `;

    return await sendEmail(env, email, name, subject, htmlContent);
}
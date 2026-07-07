export async function sendEmail(env, toEmail, toName, subject, htmlContent) {
    if (env.ENABLE_EMAILS !== 'true') {
        console.log(`[EMAIL DISABLED] Simulating mail to: ${toEmail} | Subject: ${subject}`);
        return true;
    }

    const emailPayload = {
        sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
        to: [{ email: toEmail, name: toName }],
        replyTo: { name: env.REPLY_TO_NAME, email: env.REPLY_TO_EMAIL },
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

const socialContactHtml = `
    <div style="margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-radius: 6px; text-align: center; border: 1px solid #eee;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #111a3b;"><strong>Máš dotaz nebo potřebuješ s něčím poradit?</strong></p>
        <p style="margin: 0; font-size: 14px; color: #555;">
            Kdykoliv se nám ozvi do zpráv na 
            <a href="https://www.instagram.com/bohunovice_fotbal/" style="color: #3498db; text-decoration: none; font-weight: bold;">Instagramu</a> 
            nebo na 
            <a href="https://www.facebook.com/TjSokolBohunovice/" style="color: #3498db; text-decoration: none; font-weight: bold;">Facebooku</a>.
        </p>
    </div>
`;

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

    const subject = `Potvrzení rezervace #${orderId} | TJ Sokol Bohuňovice`;

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <div style="background-color: #054a88; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: #ffd700; margin: 0; text-transform: uppercase; font-size: 24px;">Rezervace přijata!</h1>
            </div>
            <div style="padding: 30px 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px;">
                <p>Milý fanoušku/milá fanynko,</p>
                <p>díky za tvou rezervaci týmového merche. Tvůj požadavek jsme v pořádku zapsali do systému.</p>
                
                <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #3498db; margin: 25px 0;">
                    <strong style="display: block; margin-bottom: 5px;">Jak to bude probíhat dál?</strong>
                    Jakmile pro tebe věci nachystáme, dáme ti vědět e-mailem nebo na tvůj telefon. <strong>Vyzvednutí a platba pak probíhá vždy osobně <a href="https://maps.app.goo.gl/NobZxh7FnxWYCYfz9" target="_blank" style="color: #3498db; text-decoration: underline;">u nás na hřišti</a>.</strong>                
                </div>

                <h3 style="border-bottom: 2px solid #054a88; padding-bottom: 5px; color: #054a88;">Tvoje údaje</h3>
                <p style="margin: 5px 0;"><strong>Jméno:</strong> ${name}</p>
                <p style="margin: 5px 0;"><strong>Telefon:</strong> ${phone}</p>

                <h3 style="border-bottom: 2px solid #054a88; padding-bottom: 5px; margin-top: 30px; color: #054a88;">Shrnutí rezervace</h3>
                <ul style="list-style-type: none; padding: 0; margin: 0;">
                    ${itemsListHtml}
                </ul>
                <div style="text-align: right; font-size: 1.3em; margin-top: 20px; color: #054a88;">
                    <strong>Celkem k úhradě: ${totalPrice} Kč</strong>
                </div>
                
                ${socialContactHtml}

                <hr style="border: none; border-top: 1px dashed #ccc; margin: 40px 0 20px 0;">
                <p style="font-size: 12px; color: #888; text-align: center; margin: 0;">
                    Změnily se ti plány? Svou rezervaci můžeš stornovat kliknutím na odkaz níže:<br>
                    <a href="${cancelLink}" style="color: #dc3545; font-weight: bold; display: inline-block; margin-top: 10px; margin-bottom: 10px;">Zrušit rezervaci</a>
                </p>
                <div style="background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 11px; color: #999; border-radius: 4px;">
                    Toto je automaticky generovaná zpráva, prosíme, neodpovídejte na ni. V případě dotazů se nám ozvěte na naše oficiální kontakty.
                </div>
            </div>
        </div>
    `;

    return await sendEmail(env, email, name, subject, htmlContent);
}

// ============================================
// Stale order cancellation template
// ============================================
export async function sendUncollectedEmail(env, orderId, name, email) {
    const subject = `Storno objednávky #${orderId} (Nevyzvednuto) | TJ Sokol Bohuňovice`;

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #dc3545; color: #fff; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">Zrušení objednávky</h1>
            </div>
            <div style="padding: 30px;">
                <p>Ahoj ${name},</p>
                <p>tvá objednávka na tebe čekala připravená více než týden.</p>
                <p>Jelikož sis ji nevyzvedl(a), náš systém ji <strong>automaticky stornoval</strong> a zboží bylo vráceno zpět do prodeje pro ostatní fanoušky.</p>
                <p>Pokud o věci máš stále zájem, budeme rádi, když si vytvoříš na e-shopu novou rezervaci.</p>
                
                ${socialContactHtml}
                
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 40px 0 20px 0;">
                <div style="background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 11px; color: #999; border-radius: 4px;">
                    Toto je automaticky generovaná zpráva, prosíme, neodpovídejte na ni.
                </div>
            </div>
        </div>
    `;

    return await sendEmail(env, email, name, subject, htmlContent);
}

// ============================================
// Customer cancellation confirmation
// ============================================
export async function sendCustomerCancelEmail(env, orderId, name, email) {
    const subject = `Potvrzení storna rezervace #${orderId} | TJ Sokol Bohuňovice`;
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #6c757d; color: #fff; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">Rezervace stornována</h1>
            </div>
            <div style="padding: 30px;">
                <p>Ahoj ${name},</p>
                <p>potvrzujeme, že jsme na tvou žádost <strong>stornovali rezervaci #${orderId}</strong>.</p>
                <p>Zboží jsme uvolnili zpět do prodeje. Kdybys v budoucnu potřeboval(a) cokoliv dalšího, náš e-shop je ti vždy k dispozici.</p>
                
                ${socialContactHtml}
                
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 40px 0 20px 0;">
                <div style="background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 11px; color: #999; border-radius: 4px;">
                    Toto je automaticky generovaná zpráva, prosíme, neodpovídejte na ni.
                </div>
            </div>
        </div>
    `;
    return await sendEmail(env, email, name, subject, htmlContent);
}

// ============================================
// Administrator cancellation confirmation
// ============================================
export async function sendAdminCancelEmail(env, orderId, name, email) {
    const subject = `Zrušení rezervace #${orderId} | TJ Sokol Bohuňovice`;
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #dc3545; color: #fff; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">Zrušení rezervace</h1>
            </div>
            <div style="padding: 30px;">
                <p>Ahoj ${name},</p>
                <p>informujeme tě, že tvá rezervace <strong>#${orderId} byla zrušena administrátorem</strong>.</p>
                
                ${socialContactHtml}
                
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 40px 0 20px 0;">
                <div style="background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 11px; color: #999; border-radius: 4px;">
                    Toto je automaticky generovaná zpráva, prosíme, neodpovídejte na ni.
                </div>
            </div>
        </div>
    `;
    return await sendEmail(env, email, name, subject, htmlContent);
}
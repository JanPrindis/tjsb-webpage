import { sanitize } from "./utils.js";

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
            <strong>${i.quantity}x ${sanitize(i.name)}</strong> ${i.size ? `<span style="color: #666; font-size: 0.9em;">(Velikost: ${sanitize(i.size)})</span>` : ''}
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
                <p>děkujeme za rezervaci zboží z našeho fanshopu!</p>
                
                <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #3498db; margin: 25px 0;">
                    <strong style="display: block; margin-bottom: 5px;">Jak to bude probíhat dál?</strong>
                    Jakmile pro tebe vše nachystáme, dáme ti vědět e-mailem nebo na tvůj telefon. <strong>Vyzvednutí a platba pak probíhá vždy osobně <a href="https://maps.app.goo.gl/NobZxh7FnxWYCYfz9" target="_blank" style="color: #3498db; text-decoration: underline;">u nás na hřišti</a>.</strong>                
                </div>

                <h3 style="border-bottom: 2px solid #054a88; padding-bottom: 5px; color: #054a88;">Tvoje údaje</h3>
                <p style="margin: 5px 0;"><strong>Jméno:</strong> ${sanitize(name)}</p>
                <p style="margin: 5px 0;"><strong>Telefon:</strong> ${sanitize(phone)}</p>

                <h3 style="border-bottom: 2px solid #054a88; padding-bottom: 5px; margin-top: 30px; color: #054a88;">Shrnutí rezervace</h3>
                <ul style="list-style-type: none; padding: 0; margin: 0;">
                    ${itemsListHtml}
                </ul>
                <div style="text-align: right; font-size: 1.3em; margin-top: 20px; color: #054a88;">
                    <strong>Celkem k úhradě při vyzvednutí: ${totalPrice} Kč</strong>
                </div>
                
                ${socialContactHtml}

                <hr style="border: none; border-top: 1px dashed #ccc; margin: 40px 0 20px 0;">
                <p style="font-size: 12px; color: #888; text-align: center; margin: 0;">
                    Změnily se ti plány? Svou rezervaci můžeš stornovat kliknutím na odkaz níže:<br>
                    <a href="${cancelLink}" style="color: #dc3545; font-weight: bold; display: inline-block; margin-top: 10px; margin-bottom: 10px;">Zrušit rezervaci</a>
                </p>
                <div style="background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 11px; color: #999; border-radius: 4px;">
                    Toto je automaticky generovaná zpráva, prosíme, neodpovídej na ni.
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
    const subject = `Storno rezervace #${orderId} (Nevyzvednuto) | TJ Sokol Bohuňovice`;

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #dc3545; color: #fff; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">Zrušení rezervace</h1>
            </div>
            <div style="padding: 30px;">
                <p>Ahoj,</p>
                <p>tvá rezervace na tebe čekala připravená více než týden.</p>
                <p>Jelikož sis ji nevyzvedl(a), náš systém ji <strong>automaticky stornoval</strong> a zboží bylo vráceno zpět do prodeje pro ostatní fanoušky.</p>
                <p>Pokud máš o rezervované zboží stále zájem, budeme rádi, když si ve fanshopu vytvoříš novou rezervaci.</p>
                
                ${socialContactHtml}
                
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 40px 0 20px 0;">
                <div style="background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 11px; color: #999; border-radius: 4px;">
                    Toto je automaticky generovaná zpráva, prosíme, neodpovídej na ni.
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
                <p>Ahoj,</p>
                <p>potvrzujeme, že jsme na tvou žádost <strong>stornovali rezervaci #${orderId}</strong>.</p>
                <p>Zboží jsme uvolnili zpět do prodeje. Kdybys v budoucnu potřeboval(a) cokoliv dalšího, náš e-shop je ti vždy k dispozici.</p>
                
                ${socialContactHtml}
                
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 40px 0 20px 0;">
                <div style="background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 11px; color: #999; border-radius: 4px;">
                    Toto je automaticky generovaná zpráva, prosíme, neodpovídej na ni.
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
                <p>Ahoj,</p>
                <p>informujeme tě, že tvá rezervace <strong>#${orderId} byla zrušena administrátorem</strong>.</p>
                
                ${socialContactHtml}
                
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 40px 0 20px 0;">
                <div style="background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 11px; color: #999; border-radius: 4px;">
                    Toto je automaticky generovaná zpráva, prosíme, neodpovídej na ni.
                </div>
            </div>
        </div>
    `;
    return await sendEmail(env, email, name, subject, htmlContent);
}

// ============================================
// Order Ready for Pickup template
// ============================================
export async function sendReadyEmail(env, orderId, name, email) {
    const subject = `Tvoje rezervace #${orderId} je připravena! | TJ Sokol Bohuňovice`;

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #28a745; color: #fff; padding: 20px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">Máme pro tebe připravený zboží!</h1>
            </div>
            <div style="padding: 30px;">
                <p>Ahoj,</p>
                <p>skvělá zpráva! Tvá rezervace <strong>#${orderId}</strong> je nachystaná k vyzvednutí.</p>

                <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #3498db; margin: 25px 0;">
                    <strong style="display: block; margin-bottom: 5px;">Co se bude dít teď?</strong>
                    Během chvíle se ti někdo z nás ozve <strong>telefonicky nebo přes SMS</strong> a domluvíme se na přesném čase předání <a href="https://maps.app.goo.gl/NobZxh7FnxWYCYfz9" target="_blank" style="color: #3498db; text-decoration: underline;">u nás na hřišti</a>.
                    <br><br>
                    <span style="font-size: 0.9em; color: #555;">Pokud máš u rezervace uvedeno špatné číslo, tak se nám prosím ozvi přímo přes naše sociální sítě.</span>
                </div>

                <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 4px; border: 1px solid #ffeeba; text-align: center; margin-bottom: 25px;">
                    <strong>Upozornění:</strong> Na vyzvednutí rezervovaného zboží máš <strong>7 dní</strong>. Pokud si ho do té doby nevyzvedneš, bude tvá rezervace automaticky zrušena a zboží vrátíme zpět do prodeje.
                </div>
                
                ${socialContactHtml}
                
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 40px 0 20px 0;">
                <div style="background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 11px; color: #999; border-radius: 4px;">
                    Toto je automaticky generovaná zpráva, prosíme, neodpovídej na ni.
                </div>
            </div>
        </div>
    `;

    return await sendEmail(env, email, name, subject, htmlContent);
}
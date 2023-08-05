const { request } = require('undici');
const nodemailer = require('nodemailer');
const smtpTransport = require('nodemailer-smtp-transport');

const config = {
    productLink: 'https://www.costco.co.uk/{path}/{name}/p/{product id}', // The link of the product to watch.
    email: '@gmail.com', // Imap enabled gmail email
    emailPassword: '', // Imap enabled gmail password
    receiver: '' // Email address to send to when there is new stock or price has been updated.
}

class Costco {
    constructor(url) {
        this.url = url

        this.headers = {
            host: 'www.costco.co.uk',
            connection: 'keep-alive',
            'sec-ch-ua': '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'sec-fetch-site': 'none',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-user': '?1',
            'sec-fetch-dest': 'document',
            'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8'
        }

        this.transporter = nodemailer.createTransport(
            smtpTransport({
                service: 'gmail',
                auth: {
                    user: config.email,
                    pass: config.emailPassword
                }
            })
        );
    }

    extractData(data) {
        const reg = /(?<=type="application\/ld\+json">).*?(?=<\/script><meta property="product:price:amount")/gm

        let result = data.match(reg)

        try{
            result = result[0]
            result = result.split('</script><script id="schemaorg_product" type="application/ld+json">')[1]
            result = JSON.parse(result)
        }catch{
            return false
        }

        if(result) {
            return result
        }

        return false
    }

    async getProductData() {
        const req = await request(this.url, { headers: this.headers })

        const text = await req.body.text()
        const data = this.extractData(text)

        return data
    }

    sendEmail(subject, text) {
        const mailOptions = {
            from: config.email,
            to: config.receiver,
            subject, text
        };

        this.transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('Error sending email:', error);
            }
        });
    }
}

(async() => {
    // Variables for updation checking
    let holdPrice = holdStock = 0

    const page = new Costco(config.productLink)

    for(let i = 0; i < Infinity; i++) {
        const pageData = await page.getProductData()

        if(pageData) {
            const { price, stock } = pageData?.offers

            if(!price || !stock) {
                console.log('Failed to get price or stock P/S:', price, stock)
                continue
            }

            if(!holdPrice) {
                console.log(`[+] | Hold price has been updated to ${price}`)
                holdPrice = price
            }

            if(!holdStock) {
                console.log(`[+] | Hold stock has been updated to ${stock}`)
                holdStock = stock
            }

            if(holdPrice != price) {
                page.sendEmail('Costco product price has been updated.', `Price has been updated for the product "${pageData.name}" from £${holdPrice} to £${price}`)
                
                console.log(`[$] | Price has been updated for ${pageData.name} from ${holdPrice} to ${price}`)
                holdPrice = price
            }

            if(holdStock != stock) {
                page.sendEmail('Costco product stock has been updated.', `Stock has been updated for the product "${pageData.name}" from ${holdStock} unit(s) to ${stock} unit(s)`)

                console.log(`[$] | Stock has been updated for ${pageData.name} from ${holdStock} to ${stock}`)
                holdStock = stock
            }

        }

        await new Promise((x) => setTimeout(x, 5000))
    }
})()

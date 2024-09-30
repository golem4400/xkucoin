const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const FormData = require('form-data');
const { Worker, isMainThread, workerData } = require('worker_threads');

class KucoinAPIClient {
    constructor(accountIndex = 0) {
        this.headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
            "Origin": "https://www.kucoin.com",
            "Referer": "https://www.kucoin.com/miniapp/tap-game?inviterUserId=376905749&rcode=QBSLTEH5",
            "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
            "Sec-Ch-Ua-Mobile": "?1",
            "Sec-Ch-Ua-Platform": '"Android"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36"
        };
        this.accountIndex = accountIndex;
    }

    async log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const accountPrefix = `[Tài khoản ${this.accountIndex + 1}]`;
        let logMessage = `[${timestamp}] ${accountPrefix} ${msg}`;
        
        switch(type) {
            case 'success':
                console.log(logMessage.green);
                break;
            case 'error':
                console.log(logMessage.red);
                break;
            case 'warning':
                console.log(logMessage.yellow);
                break;
            default:
                console.log(logMessage.blue);
        }
    }

    async countdown(seconds) {
        for (let i = seconds; i > 0; i--) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    generateRandomPoints(totalPoints, numRequests) {
        let points = new Array(numRequests).fill(0);
        let remainingPoints = totalPoints;

        for (let i = 0; i < numRequests - 1; i++) {
            const maxPoint = Math.min(60, remainingPoints - (numRequests - i - 1));
            const point = Math.floor(Math.random() * (maxPoint + 1));
            points[i] = point;
            remainingPoints -= point;
        }

        points[numRequests - 1] = remainingPoints;

        for (let i = points.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [points[i], points[j]] = [points[j], points[i]];
        }

        return points;
    }

    async increaseGold(cookie, increment, molecule) {
        const url = "https://www.kucoin.com/_api/xkucoin/platform-telebot/game/gold/increase?lang=en_US";
        
        const formData = new FormData();
        formData.append('increment', increment);
        formData.append('molecule', molecule);
        const headers = {
            ...this.headers,
            "Cookie": cookie,
            ...formData.getHeaders()
        };

        try {
            const response = await axios.post(url, formData, { 
                headers
            });
            if (response.status === 200) {
                return { success: true, data: response.data };
            } else {
                return { success: false, error: `HTTP Error: ${response.status}` };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processAccount(cookie) {
        await this.log(`Bắt đầu xử lý`, 'info');
        
        const points = this.generateRandomPoints(3000, 55);
        let totalPoints = 0;
        let currentMolecule = 3000;

        for (let j = 0; j < points.length; j++) {
            const increment = points[j];
            currentMolecule -= increment;           
            const result = await this.increaseGold(cookie, increment, currentMolecule);
            if (result.success) {
                totalPoints += increment;
                await this.log(`Cho ăn thành công, đã bón được ${result.data.data} sâu | Còn lại ${currentMolecule} sâu`, 'success');
            } else {
                await this.log(`Không thể bón sâu: ${result.error}`, 'error');
            }

            await this.countdown(3);
        }

        await this.log(`Tổng số gold đã tăng: ${totalPoints}`, 'info');
        await this.log(`Hoàn thành xử lý tài khoản ${this.accountIndex + 1}`, 'success');
    }
}

async function workerFunction(workerData) {
    const { cookie, accountIndex } = workerData;
    const client = new KucoinAPIClient(accountIndex);
    await client.processAccount(cookie);
    parentPort.postMessage('done');
}

async function main() {
    const dataFile = path.join(__dirname, 'data.txt');
    const cookies = fs.readFileSync(dataFile, 'utf8')
        .replace(/\r/g, '')
        .split('\n')
        .filter(Boolean);

    const maxThreads = 1;
    const timeout = 10 * 60 * 1000;

    while (true) {
        for (let i = 0; i < cookies.length; i += maxThreads) {
            const workerPromises = [];

            const remainingAccounts = Math.min(maxThreads, cookies.length - i);

            for (let j = 0; j < remainingAccounts; j++) {
                const cookie = cookies[i + j];
                const worker = new Worker(__filename, {
                    workerData: { cookie, accountIndex: i + j }
                });

                const workerPromise = new Promise((resolve, reject) => {
                    worker.on('message', resolve);
                    worker.on('error', reject);
                    worker.on('exit', (code) => {
                        if (code !== 0) reject(new Error(`Luồng bị dừng với mã ${code}`));
                    });
                });

                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Luồng hết thời gian xử lý')), timeout)
                );

                workerPromises.push(Promise.race([workerPromise, timeoutPromise]));
            }

            await Promise.allSettled(workerPromises);
            console.log(`Đã hoàn thành xử lý ${remainingAccounts} tài khoản. Chuyển sang nhóm tài khoản tiếp theo...`.green);
        }

        console.log('Đã xử lý xong tất cả tài khoản. Nghỉ 300 giây...');
        await new Promise(resolve => setTimeout(resolve, 300000));
    }
}

if (isMainThread) {
    main().catch(console.error);
} else {
    workerFunction(workerData);
}

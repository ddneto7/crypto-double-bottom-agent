// Crypto Double Bottom Detection Agent
// Detecta formações de fundo duplo em criptomoedas

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const CMC_API = 'https://pro-api.coinmarketcap.com/v1';
const CMC_API_KEY = '7a703dd0-d944-41f4-805d-b9b3780e08ec';

// Configurações do agente
const CONFIG = {
    minVolume: 1000000,        // $1M USD/dia
    minMarketCap: 40000000,    // $40M USD
    timeframe: '4h',           // 4 horas
    tolerance: 0.20,           // 20% de tolerância
    timeBetweenBottoms: {      // 3-6 semanas
        min: 21,
        max: 42
    },
    checkInterval: 1800000     // Verifica a cada 30 minutos
};

// Sistema de Machine Learning simples
class MLPredictor {
    constructor() {
        this.history = [];
        this.successRate = 0;
    }
    
    learn(pattern, outcome) {
        this.history.push({ pattern, outcome });
        this.updateSuccessRate();
    }
    
    updateSuccessRate() {
        const successful = this.history.filter(h => h.outcome === 'success').length;
        this.successRate = (successful / this.history.length) * 100;
    }
    
    predict(pattern) {
        // Análise baseada em padrões anteriores
        const similarPatterns = this.history.filter(h => 
            Math.abs(h.pattern.depth - pattern.depth) < 0.1
        );
        
        if (similarPatterns.length === 0) return 0.5;
        
        const successCount = similarPatterns.filter(p => p.outcome === 'success').length;
        return successCount / similarPatterns.length;
    }
}

const ml = new MLPredictor();

// Função principal de detecção
async function detectDoubleBottom() {
    try {
        // 1. Buscar criptomoedas elegíveis
        const eligibleCryptos = await getEligibleCryptos();
        
        // 2. Analisar cada cripto
        for (const crypto of eligibleCryptos) {
            const analysis = await analyzeCrypto(crypto);
            
            if (analysis.hasDoubleBottom) {
                // 3. Usar ML para prever sucesso
                const confidence = ml.predict(analysis.pattern);
                
                // 4. Enviar alerta apropriado
                sendAlert(crypto, analysis, confidence);
            }
        }
    } catch (error) {
        console.error('Erro na detecção:', error);
    }
}

// Buscar criptomoedas com volume e market cap adequados
async function getEligibleCryptos() {
    const response = await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&order=volume_desc&per_page=250`);
    const data = await response.json();
    
    return data.filter(crypto => 
        crypto.total_volume >= CONFIG.minVolume &&
        crypto.market_cap >= CONFIG.minMarketCap
    );
}

// Analisar padrão de fundo duplo
async function analyzeCrypto(crypto) {
    // Buscar dados históricos de preço
    const priceData = await getPriceHistory(crypto.id);
    
    // Detectar fundos
    const bottoms = findBottoms(priceData);
    
    // Verificar se forma fundo duplo
    if (bottoms.length >= 2) {
        const [first, second] = bottoms.slice(-2);
        
        // Verificar critérios
        const priceDiff = Math.abs(first.price - second.price) / first.price;
        const timeDiff = (second.timestamp - first.timestamp) / (1000 * 60 * 60 * 24);
        
        if (priceDiff <= CONFIG.tolerance && 
            timeDiff >= CONFIG.timeBetweenBottoms.min && 
            timeDiff <= CONFIG.timeBetweenBottoms.max) {
            
            return {
                hasDoubleBottom: true,
                pattern: {
                    firstBottom: first,
                    secondBottom: second,
                    neckline: calculateNeckline(priceData, first, second),
                    depth: priceDiff,
                    timespan: timeDiff
                }
            };
        }
    }
    
    return { hasDoubleBottom: false };
}

// Buscar histórico de preços
async function getPriceHistory(cryptoId) {
    const days = 60; // 2 meses de dados
    const response = await fetch(
        `${COINGECKO_API}/coins/${cryptoId}/market_chart?vs_currency=usd&days=${days}&interval=4h`
    );
    const data = await response.json();
    return data.prices;
}

// Encontrar pontos de fundo
function findBottoms(priceData) {
    const bottoms = [];
    
    for (let i = 10; i < priceData.length - 10; i++) {
        const current = priceData[i][1];
        const isBottom = priceData.slice(i-10, i).every(p => p[1] >= current) &&
                        priceData.slice(i+1, i+11).every(p => p[1] >= current);
        
        if (isBottom) {
            bottoms.push({
                timestamp: priceData[i][0],
                price: current,
                index: i
            });
        }
    }
    
    return bottoms;
}

// Calcular linha de resistência (neckline)
function calculateNeckline(priceData, firstBottom, secondBottom) {
    const between = priceData.slice(firstBottom.index, secondBottom.index);
    return Math.max(...between.map(p => p[1]));
}

// Sistema de alertas
function sendAlert(crypto, analysis, confidence) {
    const { pattern } = analysis;
    const currentPrice = crypto.current_price;
    const neckline = pattern.neckline;
    const potentialGain = ((neckline - currentPrice) / currentPrice * 100).toFixed(2);
    
    let alertType, alertColor, alertEmoji;
    
    // Determinar tipo de alerta
    if (currentPrice < pattern.secondBottom.price * 1.05) {
        alertType = 'ALERTA AMARELO';
        alertColor = '🟡';
        alertEmoji = 'Segundo fundo em formação';
    } else if (pattern.secondBottom && currentPrice < neckline * 0.95) {
        alertType = 'ALERTA LARANJA';
        alertColor = '🟠';
        alertEmoji = 'Padrão completado';
    } else if (currentPrice >= neckline * 0.95) {
        alertType = 'ALERTA VERMELHO';
        alertColor = '🔴';
        alertEmoji = 'Rompimento iminente';
    }
    
    const alert = `
🚨 ${alertColor} ${alertType} - ${crypto.symbol.toUpperCase()}
${alertEmoji}

📊 Preço Atual: $${currentPrice.toFixed(4)}
📈 Market Cap: $${(crypto.market_cap / 1000000).toFixed(2)}M
💹 Volume 24h: $${(crypto.total_volume / 1000000).toFixed(2)}M
⏱️ Timeframe: 4h
📍 Primeiro Fundo: $${pattern.firstBottom.price.toFixed(4)} (${new Date(pattern.firstBottom.timestamp).toLocaleDateString()})
📍 Segundo Fundo: $${pattern.secondBottom.price.toFixed(4)} (${new Date(pattern.secondBottom.timestamp).toLocaleDateString()})
🎯 Target de Rompimento: $${neckline.toFixed(4)}
📉 Stop Loss Sugerido: $${(pattern.secondBottom.price * 0.95).toFixed(4)}
⚡ Potencial de Alta: ${potentialGain}%
🤖 Confiança ML: ${(confidence * 100).toFixed(1)}%
    `;
    
    console.log(alert);
    
    // Aqui você pode adicionar integração com Telegram, Discord, etc.
    // Para o EternalAI, retornamos o alerta
    return alert;
}

// Executar a cada 30 minutos
setInterval(detectDoubleBottom, CONFIG.checkInterval);

// Executar imediatamente ao iniciar
detectDoubleBottom();

// Exportar para o EternalAI
module.exports = { detectDoubleBottom, CONFIG, ml };

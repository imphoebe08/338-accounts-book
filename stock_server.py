# stock_server.py
from flask import Flask, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import urllib.request
import json
import datetime

app = Flask(__name__)
CORS(app) # 允許 React 呼叫這台伺服器

# 初始化 Firebase Admin
try:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print("❌ Firebase 初始化失敗，請確認 serviceAccountKey.json 是否放在同一資料夾！")

@app.route('/update-prices', methods=['POST'])
def update_prices():
    try:
        print("開始執行股價更新...")
        assets_ref = db.collection('assets')
        docs = assets_ref.where('type', '==', 'stock').stream()
        
        success_count = 0
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        
        for doc in docs:
            data = doc.to_dict()
            symbol = data.get('symbol', '').strip().upper()
            if not symbol:
                continue
                
            clean_symbol = symbol.replace('.TW', '').replace('.TWO', '')
            
            # 判斷是否為台股 (純數字或開頭為數字)
            is_tw_stock = clean_symbol.isdigit() or (len(clean_symbol) >= 4 and clean_symbol[0].isdigit())
            
            price = None
            suffixes = ['.TW', '.TWO'] if is_tw_stock else ['']
            
            for suffix in suffixes:
                if price: break
                query_symbol = f"{clean_symbol}{suffix}"
                try:
                    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{query_symbol}?interval=1d&range=1d"
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
                    with urllib.request.urlopen(req, timeout=5) as response:
                        res_data = json.loads(response.read().decode())
                        quote_price = res_data.get('chart', {}).get('result', [{}])[0].get('meta', {}).get('regularMarketPrice')
                        if quote_price is not None:
                            price = float(quote_price)
                except Exception:
                    pass
            
            if price and price > 0:
                assets_ref.document(doc.id).update({
                    'refPrice': round(price, 2),
                    'updatedAt': today
                })
                success_count += 1
                print(f"✅ 成功: {data.get('item')} ({symbol}) -> ${round(price, 2)}")
            else:
                print(f"❌ 失敗: {data.get('item')} ({symbol}) 無法取得報價")
                
        return jsonify({"success": True, "count": success_count})
        
    except Exception as e:
        print(f"伺服器錯誤: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    print("🚀 Python 爬蟲伺服器已啟動！(等待 React 呼叫中...)")
    app.run(port=5000)

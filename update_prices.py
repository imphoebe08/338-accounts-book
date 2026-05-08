from http.server import BaseHTTPRequestHandler
import json
import os
import firebase_admin
from firebase_admin import credentials, firestore
import yfinance as yf
import datetime

# 啟動時檢查是否已經初始化過 Firebase，避免重複執行
if not firebase_admin._apps:
    try:
        # 雲端環境中不能放檔案，改從 Vercel 的環境變數讀取金鑰！
        service_account_info = json.loads(os.environ.get('FIREBASE_SERVICE_ACCOUNT', '{}'))
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
    except Exception as e:
        print("Firebase 初始化失敗:", e)

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            db = firestore.client()
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
                is_tw_stock = clean_symbol.isdigit() or (len(clean_symbol) >= 4 and clean_symbol[0].isdigit())
                
                price = None
                suffixes = ['.TW', '.TWO'] if is_tw_stock else ['']
                
                for suffix in suffixes:
                    if price: break
                    query_symbol = f"{clean_symbol}{suffix}"
                    try:
                        ticker = yf.Ticker(query_symbol)
                        info = ticker.fast_info
                        if 'lastPrice' in info:
                            price = info['lastPrice']
                    except Exception:
                        pass
                
                if price and price > 0:
                    assets_ref.document(doc.id).update({
                        'refPrice': round(price, 2),
                        'updatedAt': today
                    })
                    success_count += 1
                    
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "count": success_count}).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
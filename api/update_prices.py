from http.server import BaseHTTPRequestHandler
import json
import os
import firebase_admin
from firebase_admin import credentials, firestore
import urllib.request
import datetime

# 啟動時檢查是否已經初始化過 Firebase，並捕捉詳細錯誤
firebase_err = None
if not firebase_admin._apps:
    try:
        env_val = os.environ.get('FIREBASE_SERVICE_ACCOUNT')
        if not env_val:
            raise Exception("找不到 Vercel 環境變數 FIREBASE_SERVICE_ACCOUNT，請至後台設定！")
        
        service_account_info = json.loads(env_val)
        # 修復 Vercel 環境變數中 private_key 的換行符號可能被跳脫的問題
        if 'private_key' in service_account_info:
            service_account_info['private_key'] = service_account_info['private_key'].replace('\\n', '\n')
            
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
    except Exception as e:
        firebase_err = str(e)
        print("Firebase 初始化失敗:", e)

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            if firebase_err:
                raise Exception(f"Firebase 設定錯誤: {firebase_err}")
                
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
                    
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "count": success_count}).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
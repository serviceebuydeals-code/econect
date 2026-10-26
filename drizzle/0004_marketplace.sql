CREATE TABLE IF NOT EXISTS market_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent TEXT REFERENCES market_categories(id), admin_created INTEGER NOT NULL DEFAULT 0, UNIQUE(name,parent));
CREATE UNIQUE INDEX IF NOT EXISTS market_category_roots ON market_categories(lower(name)) WHERE parent IS NULL;
CREATE TABLE IF NOT EXISTS market_folders (id TEXT PRIMARY KEY, seller TEXT NOT NULL REFERENCES profiles(id), name TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(seller,name));
CREATE TABLE IF NOT EXISTS market_products (id TEXT PRIMARY KEY, seller TEXT NOT NULL REFERENCES profiles(id), name TEXT NOT NULL, price REAL NOT NULL CHECK(price>0), location TEXT NOT NULL, description TEXT NOT NULL, images TEXT NOT NULL, category TEXT NOT NULL REFERENCES market_categories(id), subcategory TEXT REFERENCES market_categories(id), folder TEXT REFERENCES market_folders(id), active INTEGER NOT NULL DEFAULT 1, created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS market_products_seller ON market_products(seller,active,created);
CREATE INDEX IF NOT EXISTS market_products_category ON market_products(category,subcategory,active);
CREATE TRIGGER IF NOT EXISTS market_product_charge BEFORE INSERT ON market_products BEGIN
 SELECT CASE WHEN COALESCE((SELECT balance+bonus FROM profiles WHERE id=NEW.seller),0)<20 THEN RAISE(ABORT,'Insufficient eCoin balance. Add eCoin to publish.') END;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT 'listing-b-'||NEW.id,NEW.seller,-min(bonus,20),'Marketplace product submission','bonus' FROM profiles WHERE id=NEW.seller AND bonus>0;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT 'listing-r-'||NEW.id,NEW.seller,-max(0,20-bonus),'Marketplace product submission','withdrawable' FROM profiles WHERE id=NEW.seller AND bonus<20;
 UPDATE profiles SET balance=balance-max(0,20-bonus),bonus=max(0,bonus-20) WHERE id=NEW.seller;
END;
CREATE TABLE IF NOT EXISTS market_requests (id TEXT PRIMARY KEY, product TEXT NOT NULL REFERENCES market_products(id), buyer TEXT NOT NULL REFERENCES profiles(id), seller TEXT NOT NULL REFERENCES profiles(id), created TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(product,buyer));
CREATE TABLE IF NOT EXISTS market_preferences (user TEXT PRIMARY KEY REFERENCES profiles(id), personalized INTEGER NOT NULL CHECK(personalized IN(0,1)), updated TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS market_interests (user TEXT NOT NULL REFERENCES profiles(id), category TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 1, updated TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user,category));
CREATE TABLE IF NOT EXISTS market_promotions (id TEXT PRIMARY KEY, seller TEXT NOT NULL REFERENCES profiles(id), product TEXT REFERENCES market_products(id), days INTEGER NOT NULL CHECK(days IN(3,7,30)), coins INTEGER NOT NULL CHECK(coins>0), source TEXT NOT NULL CHECK(source IN('wallet','bank')), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','confirmed','rejected')), reference TEXT NOT NULL DEFAULT '', created TEXT DEFAULT CURRENT_TIMESTAMP, starts TEXT, ends TEXT);
CREATE TRIGGER IF NOT EXISTS market_promotion_wallet BEFORE INSERT ON market_promotions WHEN NEW.source='wallet' BEGIN
 SELECT CASE WHEN NEW.status!='confirmed' OR COALESCE((SELECT balance+bonus FROM profiles WHERE id=NEW.seller),0)<NEW.coins*100 THEN RAISE(ABORT,'Insufficient eCoin balance for promotion.') END;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT 'promo-b-'||NEW.id,NEW.seller,-min(bonus,NEW.coins*100),'Marketplace promotion','bonus' FROM profiles WHERE id=NEW.seller AND bonus>0;
 INSERT INTO ledger(id,user,points,label,bucket) SELECT 'promo-r-'||NEW.id,NEW.seller,-max(0,NEW.coins*100-bonus),'Marketplace promotion','withdrawable' FROM profiles WHERE id=NEW.seller AND bonus<NEW.coins*100;
 UPDATE profiles SET balance=balance-max(0,NEW.coins*100-bonus),bonus=max(0,bonus-NEW.coins*100) WHERE id=NEW.seller;
END;
CREATE TABLE IF NOT EXISTS market_ad_views (id TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES profiles(id), promotion TEXT NOT NULL REFERENCES market_promotions(id), day TEXT NOT NULL, slot TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user,day,slot));
CREATE INDEX IF NOT EXISTS market_ad_cap ON market_ad_views(user,day);
INSERT OR IGNORE INTO market_categories(id,name,parent,admin_created) VALUES ('electronics','Electronics',NULL,1),('fashion','Fashion',NULL,1),('home','Home & Furniture',NULL,1),('vehicles','Vehicles',NULL,1),('property','Property',NULL,1),('beauty','Beauty & Personal Care',NULL,1),('food','Food & Groceries',NULL,1),('services','Services',NULL,1),('other','Other',NULL,1);

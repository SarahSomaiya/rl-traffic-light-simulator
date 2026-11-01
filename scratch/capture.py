import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

options = Options()
options.add_argument('--headless=new')
options.add_argument('--window-size=1200,800')
options.add_argument('--disable-gpu')

driver = webdriver.Chrome(options=options)
try:
    driver.get('http://localhost:3000')
    time.sleep(3)
    driver.save_screenshot('C:/Users/rchan/.gemini/antigravity/brain/f749d2db-a9df-4f12-8d8a-b7e44f88aea7/dashboard_top.png')

    # Scroll card body down
    driver.execute_script('document.querySelector(".card-body").scrollTop = 450;')
    time.sleep(1)
    driver.save_screenshot('C:/Users/rchan/.gemini/antigravity/brain/f749d2db-a9df-4f12-8d8a-b7e44f88aea7/dashboard_scrolled.png')
    print('SCREENSHOTS_CAPTURED')
finally:
    driver.quit()


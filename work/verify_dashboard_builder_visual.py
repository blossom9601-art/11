from pathlib import Path
import re
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

out = Path("work/dashboard-builder-fixed.png").resolve()

opts = Options()
opts.add_argument("--ignore-certificate-errors")
opts.add_argument("--allow-insecure-localhost")
opts.add_argument("--window-size=1600,950")
opts.add_argument("--force-device-scale-factor=1")

driver = webdriver.Chrome(options=opts)
try:
    wait = WebDriverWait(driver, 20)
    driver.get("https://192.168.56.108/login")
    wait.until(EC.presence_of_element_located((By.ID, "employee_id"))).send_keys("admin")
    driver.find_element(By.ID, "password").send_keys("admin1234!")
    driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
    wait.until(lambda d: "/login" not in d.current_url)

    new_id = "11111111-1111-4111-8111-111111111111"
    driver.get(f"https://192.168.56.108/b/dashboard_builder/{new_id}")
    wait.until(EC.presence_of_element_located((By.CLASS_NAME, "dw-full-create")))
    time.sleep(1.0)
    data = driver.execute_script(
        """
        const title = document.querySelector('#dw-create-title')?.textContent.trim();
        const body = document.body;
        const bg = getComputedStyle(document.querySelector('.dw-full-create')).background;
        const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map(x => x.href).filter(x => x.includes('dashboard_workspace'));
        const text = document.querySelector('.dw-create-window')?.innerText || '';
        return {
          url: location.href,
          title,
          bodyClass: body.className,
          hasHeader: !!document.querySelector('.main-header') && getComputedStyle(document.querySelector('.main-header')).display !== 'none',
          hasSidebar: !!document.querySelector('.sidebar') && getComputedStyle(document.querySelector('.sidebar')).display !== 'none',
          bg,
          css,
          text
        };
        """
    )
    driver.save_screenshot(str(out))
    print(data)
    print("uuid_url", bool(re.search(r"/b/dashboard_builder/[0-9a-f-]{36}$", data["url"])))
    print(out)
finally:
    driver.quit()

from pathlib import Path
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

out = Path("work/dashboard-my-fixed.png").resolve()

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
    driver.get("https://192.168.56.108/b/dashboard_my")
    wait.until(EC.presence_of_element_located((By.ID, "system-empty")))
    time.sleep(1.0)

    dims = driver.execute_script(
        """
        const img = document.querySelector('#system-empty .empty-icon-img');
        const wrap = document.querySelector('#system-empty .empty-illustration');
        const empty = document.querySelector('#system-empty');
        const tabs = [...document.querySelectorAll('.system-tab-btn')].map(x => x.textContent.trim());
        const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map(x => x.href).filter(x => x.includes('dashboard_workspace'));
        const r = img.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        const er = empty.getBoundingClientRect();
        return {img:{w:r.width,h:r.height}, wrap:{w:wr.width,h:wr.height}, empty:{w:er.width,h:er.height}, tabs, css};
        """
    )
    driver.save_screenshot(str(out))
    print(dims)
    print(out)
finally:
    driver.quit()

from pathlib import Path
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

out = Path("work/dashboard-editor-enterprise.png").resolve()

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

    dash_id = "22222222-2222-4222-8222-222222222222"
    driver.get(f"https://192.168.56.108/b/dashboard_builder/{dash_id}")
    wait.until(EC.presence_of_element_located((By.CLASS_NAME, "dw-full-create")))
    driver.execute_script(
        """
        const buttons = [...document.querySelectorAll('[data-start-dashboard]')];
        const target = buttons.find((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        target.click();
        """
    )
    wait.until(EC.presence_of_element_located((By.CLASS_NAME, "dw-editor-shell")))
    time.sleep(1.0)

    data = driver.execute_script(
        """
        const shell = document.querySelector('.dw-editor-shell').getBoundingClientRect();
        const main = document.querySelector('main.main-content').getBoundingClientRect();
        const canvas = document.querySelector('.dw-editor-canvas').getBoundingClientRect();
        const topbar = document.querySelector('.dw-editor-topbar').getBoundingClientRect();
        const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map(x => x.href).filter(x => x.includes('dashboard_workspace'));
        return {
          url: location.href,
          css,
          main: {x: main.x, y: main.y, w: main.width, h: main.height},
          shell: {x: shell.x, y: shell.y, w: shell.width, h: shell.height},
          topbar: {x: topbar.x, y: topbar.y, w: topbar.width, h: topbar.height},
          canvas: {x: canvas.x, y: canvas.y, w: canvas.width, h: canvas.height},
          bodyClass: document.body.className
        };
        """
    )
    driver.save_screenshot(str(out))
    print(data)
    print(out)
finally:
    driver.quit()

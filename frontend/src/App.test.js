import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import DocumentViewerPage from "./pages/DocumentViewerPage";
import { act } from "react-dom/test-utils";


import api from "./services/api";

jest.mock("./services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();

  api.get.mockImplementation((url) => {
    if (url === "/files") {
      return Promise.resolve({
        data: [
          {
            id: 1,
            filename: "test-document.pdf",
            originalName: "test-document.pdf",
            status: "Done",
            pageCount: 5,
            normalizedType: "PDF",
            uploadedBy: "Admin",
            category: "General"
          }
        ]
      });
    }

    if (url === "/dashboard/stats") {
      return Promise.resolve({
        data: {
          totalDocuments: 1,
          done: 1,
          processing: 0,
          queued: 0,
          failed: 0,
          cancelled: 0
        }
      });
    }

    if (url.includes("/pages")) {
      return Promise.resolve({
        data: []
      });
    }

    return Promise.resolve({
      data: []
    });
  });

  api.post.mockResolvedValue({
    data: {}
  });
});
test("renders application", () => {
  render(<App />);
  expect(document.body).toBeInTheDocument();
});


test("shows login page when user is not logged in", () => {

  render(<App />);

  expect(
    screen.getByRole("button", {name:/login/i})
  ).toBeInTheDocument();

});


test("shows dashboard page when user is logged in", async () => {

  localStorage.setItem("token","fake-token");
  localStorage.setItem("role","Admin");


  render(<App />);


  expect(
    await screen.findByText(/dashboard/i)
  ).toBeInTheDocument();

});


test("shows upload button for admin user", async () => {

  localStorage.setItem("token","fake-token");
  localStorage.setItem("role","Admin");


  render(<App />);


  expect(
    await screen.findByRole(
      "button",
      {name:/upload/i}
    )
  ).toBeInTheDocument();

});


test("shows documents table in dashboard", async () => {

  localStorage.setItem("token","fake-token");
  localStorage.setItem("role","Admin");


  render(<App />);


  expect(
    await screen.findByRole("table")
  ).toBeInTheDocument();

});


test("shows search input in dashboard", async () => {

  localStorage.setItem("token","fake-token");
  localStorage.setItem("role","Admin");


  render(<App />);


  expect(
    await screen.findByPlaceholderText(/search documents/i)
  ).toBeInTheDocument();

});


test("shows logout button in dashboard", async () => {

  localStorage.setItem("token","fake-token");
  localStorage.setItem("role","Admin");


  render(<App />);


  expect(
    await screen.findByRole(
      "button",
      {name:/logout/i}
    )
  ).toBeInTheDocument();

});

test("viewer shows read only UI", async () => {
  render(
    <DocumentViewerPage
      filename="test.pdf"
      initialPageNumber={null}
      onBack={() => {}}
    />
  );

  expect(
    await screen.findByText(/document viewer/i)
  ).toBeInTheDocument();

  expect(
    await screen.findByRole("button", { name: /back/i })
  ).toBeInTheDocument();
});

// test("viewer shows read only UI", async () => {


//   render(
//     <DocumentViewerPage
//       filename="test.pdf"
//       initialPageNumber={null}
//       onBack={()=>{}}
//     />
//   );


//   expect(
//     screen.getByText(/document viewer/i)
//   ).toBeInTheDocument();


//   expect(
//     screen.getByRole(
//       "button",
//       {name:/back/i}
//     )
//   ).toBeInTheDocument();


// });


test("Document Row renders correctly", async () => {
  // 1. لازم نسجل دخول قبل الـ render لحتى يفتح الـ Dashboard ويطلب الملفات!
  localStorage.setItem("token", "fake-token");
  localStorage.setItem("role", "Admin");

  render(<App />);

  // 2. الـ findByText رح تنتظر الـ Mock data لتظهر بالجدول
  const docName = await screen.findByText(/test-document/i);
  expect(docName).toBeInTheDocument();

 const statuses = await screen.findAllByText(/Done/i);
expect(statuses.length).toBeGreaterThan(0);
});
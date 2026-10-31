# Cynbit Intelligent Service Consultant
### Cynbit Assessment

## 1. Introduction

While exploring Cynbit's website, I saw an opportunity to improve how potential customers discover the company's services and communicate their project requirements.

A visitor may know the problem they want to solve without knowing which service or product would be appropriate. A conventional contact form collects their details and message, but it does not actively help them understand their options.

To address this, I built **Cynbit Intelligent Service Consultant**, a conversational assistant that helps visitors explain their requirements, discover relevant Cynbit offerings, and prepare a project brief for the team.

The aim was to make the initial enquiry process more useful without making it unnecessarily complicated.

## 2. Problem Statement

When someone approaches a software development company, they do not always have a clear technical specification. They might have a business problem but be unsure whether they need an existing product, a custom application, or an automation solution.

A standard enquiry form leaves the visitor to figure this out independently. It can also result in incomplete project descriptions that require further clarification.

I wanted to improve this initial interaction by allowing visitors to describe their needs naturally and receive suggestions based on Cynbit's documented products and services.

## 3. Proposed Solution

The application provides a conversational interface where visitors can explain what they are trying to achieve. It uses a retrieval-augmented generation (RAG) approach to find relevant information from a central Cynbit knowledge document and uses an LLM to generate a contextual response.

Depending on the visitor's requirements, the consultant can recommend an existing product, suggest a relevant service, or help outline a potential custom development requirement.

Instead of sending an enquiry immediately, the application maintains a project draft that the visitor can review before submitting it.

The main workflow is:

1. Verify the visitor's email address using an OTP.
2. Discuss the visitor's business problem with the consultant.
3. Receive relevant product or service recommendations.
4. Keep the chat and verified identity in a browser tab's current thread only.
5. Click **Review & Send** to generate the completed brief once from the full conversation.
6. Explicitly submit the final brief to Cynbit's team from the review view.

This keeps the visitor in control of what gets submitted.

## 4. Technology Stack

The project uses the following technologies:

| Technology | Purpose |
|---|---|
| React | Building the user interface |
| TypeScript | Type safety across the application |
| Vite | Frontend development and build tooling |
| Node.js | Backend runtime |
| Express.js | API routes and request handling |
| Groq API | Generating conversational responses |
| RAG | Retrieving relevant information from Cynbit's knowledge base |
| PostgreSQL | Persisting application data and submission state |
| Resend | Sending verification and enquiry emails |
| Zod | Validating incoming API requests |

The frontend and backend are maintained in one repository. They can be deployed together behind a single application URL, while PostgreSQL and external API services remain separate dependencies.

## 5. Implementation

### 5.1 Knowledge Base and Retrieval

I created a central Markdown document containing information about Cynbit's products, services, portfolio, and publicly available company details.

When a visitor describes a problem, the backend retrieves relevant sections from this document and supplies them as context to the language model. This helps the consultant make recommendations based on available information rather than relying entirely on the model's general knowledge.

The knowledge document can be updated as the company's offerings change.

The current retrieval implementation uses keyword-based matching. It provides a simple starting point, although more advanced semantic retrieval could improve results when visitors describe a service using different terminology.

### 5.2 Conversational Discovery

The consultant is designed to understand the visitor's goal before recommending a solution.

It prioritises relevant existing products and services instead of asking a long list of predefined questions. When additional information is necessary, it asks focused follow-up questions.

If the available knowledge does not support a confident recommendation, the consultant can explain that the requirement may need further assessment rather than presenting an unsupported product match.

### 5.3 Email Verification

Visitors complete email OTP verification before beginning the discovery process.

The backend validates verification requests and applies expiry and attempt limits. Verification is intended to reduce incomplete or unauthorised submissions.

The verification flow and email delivery depend on the application's configured environment and email provider.

### 5.4 Current Thread and Persistent Records

The browser keeps the current verified thread in `sessionStorage` and `localStorage` for refresh recovery. The session marker is tab-specific, while identity and current messages are removed when a new browser thread starts, when the visitor starts over, or after submission according to the configured reset flow.

PostgreSQL stores company, contact, conversation, OTP, session, report, and send-claim records independently of the browser. Database history is available for product-team operations but is not automatically loaded back into the active frontend chat. Normal chat exchanges do not create project reports or send discovery emails.

A saved project brief exists only after the visitor explicitly clicks **Review & Send**. Clicking the action again generates a fresh brief from the complete current conversation rather than reusing a stale draft.

### 5.5 Review and Submission

The application separates discovery from submission.

During discovery, the consultant helps the visitor develop their requirements without automatically emailing the team. The **Review & Send** action opens the final draft, giving the visitor an opportunity to check the information.

The visitor then explicitly submits the brief. The backend uses persistent submission state and database safeguards to prevent the same brief from being accepted repeatedly.

Email delivery also needs to account for retries and provider failures so that a repeated request does not create duplicate notifications.

## 6. Challenges and Design Decisions

One of the main design decisions was keeping the conversation useful without making it too dependent on a fixed questionnaire.

A rigid form can collect structured information, but it may not suit visitors who are still exploring their options. I therefore used a conversational approach and kept the recommendations grounded in retrieved company information.

Another decision was to separate draft creation from final submission. Generating a project brief should not automatically notify the company, because the visitor may still want to correct or remove information.

I also kept the knowledge base separate from the application logic. This makes it easier to maintain company information without rewriting the conversation flow.

Finally, submission handling requires more care than a simple email endpoint. A visitor might click the submit button twice, refresh the page, or retry after a network failure. Persistent state and appropriate database constraints are important for handling these cases.

## 7. Testing and Validation

The following cases should be checked as part of validating the application:

- Valid and invalid OTP submissions.
- OTP expiry and repeated verification attempts.
- Product recommendations for different business requirements.
- Responses when the knowledge base contains no suitable match.
- Confirming that chat messages do not generate or email a brief automatically.
- Confirming that the complete conversation is sent when **Review & Send** is clicked.
- Draft persistence after refreshing the page within the same browser thread.
- Removal of identity and current messages after thread closure and reset.
- Review and correction of the final brief.
- Repeated submission requests and duplicate email prevention.
- Behaviour when the LLM API or email provider is unavailable.
- Validation of required fields and malformed API requests.

A production build was run successfully for the React client and Express/TypeScript server. Database, Resend, OTP delivery, PostgreSQL SSL, cross-tab thread lifecycle, and external provider behaviour require deployment-specific runtime verification with the relevant environment variables configured. A feature should not be considered verified solely because its endpoint or interface exists.

## 8. Limitations and Future Improvements

The current retrieval approach uses keyword matching rather than embeddings or a vector database. Semantic retrieval could help identify relevant services when a visitor's wording differs significantly from the knowledge document.

The quality of recommendations also depends on the accuracy and completeness of the available company information. The knowledge base would need to be maintained as Cynbit introduces or changes products and services.

Further improvements could include automated integration tests, stronger monitoring of email delivery, more detailed retrieval evaluation, and a more comprehensive administrative interface for updating company information.

The system could also be evaluated using a set of representative customer enquiries to measure whether it consistently retrieves the correct information and recommends appropriate offerings.

## 9. Conclusion

Cynbit Intelligent Service Consultant is an attempt to make the first interaction between a potential customer and Cynbit more useful.

Rather than asking visitors to describe everything in a single contact form, it gives them an opportunity to explain their problem, explore relevant offerings, and develop a clearer project brief.

The implementation combines a conversational interface, retrieval-based company knowledge, persistent draft management, email verification, and explicit final submission in one full-stack application.

The project also provided an opportunity to work through practical concerns beyond the chatbot itself, particularly data persistence, API validation, email workflows, and duplicate-submission handling.

The intended outcome is a more guided enquiry experience that helps visitors communicate their requirements while giving Cynbit's team a clearer starting point for understanding potential projects.
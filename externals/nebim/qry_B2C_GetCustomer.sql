ALTER PROCEDURE qry_B2C_GetCustomer (
	@Phone NVARCHAR (30) = N'',
	@Email NVARCHAR (30) = N''
)
AS
BEGIN
		SELECT * FROM (
		SELECT			TOP 1
						CustomerCode = cdCurrAcc.CurrAccCode
					  , FirstName
					  , LastName
					  , Type = CASE WHEN cdCurrAcc.CurrAccTypeCode = 4 THEN 3 WHEN cdCurrAcc.CurrAccTypeCode = 8 THEN 31 ELSE cdCurrAcc.CurrAccTypeCode END
		FROM			cdCurrAcc WITH ( NOLOCK )
			INNER JOIN	dbo.prCurrAccCommunication WITH ( NOLOCK )
				ON prCurrAccCommunication.CurrAccTypeCode			 = cdCurrAcc.CurrAccTypeCode
				   AND	prCurrAccCommunication.CurrAccCode			 = cdCurrAcc.CurrAccCode
				   AND	prCurrAccCommunication.CommunicationTypeCode = 3
		WHERE			CommAddress = @Email
		UNION
		SELECT			TOP 1
						CustomerCode = cdCurrAcc.CurrAccCode
					  , FirstName
					  , LastName
					  , Type = CASE WHEN cdCurrAcc.CurrAccTypeCode = 4 THEN 3 WHEN cdCurrAcc.CurrAccTypeCode = 8 THEN 31 ELSE cdCurrAcc.CurrAccTypeCode END
		FROM			cdCurrAcc WITH ( NOLOCK )
			INNER JOIN	dbo.prCurrAccCommunication WITH ( NOLOCK )
				ON prCurrAccCommunication.CurrAccTypeCode																							= cdCurrAcc.CurrAccTypeCode
				   AND	prCurrAccCommunication.CurrAccCode																							= cdCurrAcc.CurrAccCode
				   AND	prCurrAccCommunication.CommunicationTypeCode																				= 7
				   AND	RIGHT(RTRIM ( REPLACE ( REPLACE ( REPLACE ( prCurrAccCommunication.CommAddress, N' ', N'' ), N'(', N'' ), N')', N'' )), 10) = @Phone 
		UNION
		SELECT
						CustomerCode	= ''
					  , FirstName		= ''
					  , LastName		= ''
					  , Type			= 0 
		) AS Result		ORDER BY Result.Type Desc 
END
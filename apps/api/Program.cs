using Microsoft.EntityFrameworkCore;
using VocaCycle.Api.Data;
using VocaCycle.Api.Contracts;
using VocaCycle.Api.Models;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddDbContext<VocaCycleDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));
var app = builder.Build();

// Configure the HTTP request pipeline.

app.UseHttpsRedirection();


app.MapGet("/health", () => new { status = "ok" });
app.MapPost("/words", async (CreateWordRequest request, VocaCycleDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.Text)
    || string.IsNullOrWhiteSpace(request.Translation))
    {
        return Results.BadRequest(new { error = "Text and Translation are required." });
    }
    var normalizedText = request.Text.Trim().ToLowerInvariant();

    var wordExists = await db.Words.AnyAsync(
    word => word.Text == normalizedText
);

    if (wordExists)
    {
        return Results.Conflict(new
        {
            error = "Word already exists."
        });
    }

    var word = new Word
    {
        Text = normalizedText,
        Translation = request.Translation.Trim()
    };

    db.Words.Add(word);
    try
    {
        await db.SaveChangesAsync();
    }
    catch (DbUpdateException ex)
        when (ex.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: "IX_Words_Text"
        })
    {
        return Results.Conflict(new
        {
            error = "Word already exists."
        });
    }

    return Results.Created($"/words/{word.Id}", word);
});
app.MapGet("/words", async (VocaCycleDbContext db) =>
{
    var words = await db.Words.ToListAsync();

    return Results.Ok(words);
});

app.Run();

